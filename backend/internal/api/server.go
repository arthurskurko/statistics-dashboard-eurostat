package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"eurostat-estonia-dashboard/backend/internal/jobs"
	"eurostat-estonia-dashboard/backend/internal/store"
)

type Server struct {
	defaults      *store.DefaultChartStore
	forecastJobs  *jobs.Manager
	allowedOrigin string
}

func NewServer(defaults *store.DefaultChartStore, forecastJobs *jobs.Manager, allowedOrigin string) http.Handler {
	s := &Server{
		defaults:      defaults,
		forecastJobs:  forecastJobs,
		allowedOrigin: allowedOrigin,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/default-charts", s.handleDefaultCharts)
	mux.HandleFunc("/api/default-charts/export", s.handleDefaultChartsExport)
	mux.HandleFunc("/api/forecasts/run", s.handleForecastRun)
	mux.HandleFunc("/api/forecasts/jobs/", s.handleForecastJobByID)

	return s.withMiddleware(mux)
}

func (s *Server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := s.allowedOrigin
		if origin == "" {
			origin = "*"
		}

		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "600")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start).String())
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleDefaultCharts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		userID := r.URL.Query().Get("userId")
		dashboard := r.URL.Query().Get("dashboard")
		set, err := s.defaults.Get(r.Context(), userID, dashboard)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, set)
	case http.MethodPut:
		var req store.DefaultChartSet
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
			return
		}

		stored, err := s.defaults.Upsert(r.Context(), req)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, stored)
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handleDefaultChartsExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	// Allow exporting only from localhost to avoid remote writes.
	// Check the remote IP of the request and require loopback.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "export allowed from localhost only"})
		return
	}

	var req struct {
		UserID    string `json:"userId"`
		Dashboard string `json:"dashboard"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}

	userID := strings.TrimSpace(req.UserID)
	if userID == "" {
		userID = "anonymous"
	}
	dashboard := strings.TrimSpace(req.Dashboard)
	if dashboard == "" {
		dashboard = "eurostat"
	}

	set, err := s.defaults.Get(r.Context(), userID, dashboard)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Determine export directory (configurable via EXPORT_DIR env var)
	exportDir := os.Getenv("EXPORT_DIR")
	if exportDir == "" {
		exportDir = filepath.Join("..", "public", "default-charts")
		if _, err := os.Stat(exportDir); err != nil {
			// Fallback to dist path in built mode in case public path is unavailable.
			exportDir = filepath.Join("..", "dist", "default-charts")
		}
	}

	if err := os.MkdirAll(exportDir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to create export dir: %v", err)})
		return
	}

	filename := fmt.Sprintf("%s-%s-default-charts.json", dashboard, userID)
	filename = strings.ReplaceAll(filename, string(filepath.Separator), "-")
	outPath := filepath.Join(exportDir, filename)

	payload, err := json.MarshalIndent(set, "", "  ")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if err := os.WriteFile(outPath, payload, 0o644); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to write file: %v", err)})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"path": outPath})
}

func (s *Server) handleForecastRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	type request struct {
		DatasetCodes []string `json:"datasetCodes"`
	}

	var req request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}

	job, err := s.forecastJobs.Start(req.DatasetCodes)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusAccepted, job)
}

func (s *Server) handleForecastJobByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}

	jobID := strings.TrimPrefix(r.URL.Path, "/api/forecasts/jobs/")
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing job id"})
		return
	}

	job, ok := s.forecastJobs.Get(jobID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}

	writeJSON(w, http.StatusOK, job)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func methodNotAllowed(w http.ResponseWriter) {
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}
