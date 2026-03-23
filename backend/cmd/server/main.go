package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"eurostat-estonia-dashboard/backend/internal/api"
	"eurostat-estonia-dashboard/backend/internal/jobs"
	"eurostat-estonia-dashboard/backend/internal/store"
	_ "modernc.org/sqlite"
)

func main() {
	port := envOrDefault("BACKEND_PORT", "8090")
	allowedOrigin := envOrDefault("ALLOWED_ORIGIN", "*")
	pythonCmd := envOrDefault("PYTHON_CMD", "python")
	rootDir := envOrDefault("PROJECT_ROOT", "..")
	dbPath := envOrDefault("DB_PATH", filepath.Join("data", "dashboard.db"))

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatalf("failed to create db directory: %v", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("failed to open sqlite: %v", err)
	}
	defer db.Close()

	defaultStore := store.NewDefaultChartStore(db)
	if err := defaultStore.Init(); err != nil {
		log.Fatalf("failed to init default chart table: %v", err)
	}

	forecastJobs := jobs.NewManager(pythonCmd, filepath.Clean(rootDir))
	handler := api.NewServer(defaultStore, forecastJobs, allowedOrigin)

	addr := ":" + port
	log.Printf("backend listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
