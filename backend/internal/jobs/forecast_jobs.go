package jobs

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type JobStatus string

const (
	StatusQueued    JobStatus = "queued"
	StatusRunning   JobStatus = "running"
	StatusSucceeded JobStatus = "succeeded"
	StatusFailed    JobStatus = "failed"
)

type ForecastJob struct {
	ID           string    `json:"id"`
	Status       JobStatus `json:"status"`
	DatasetCodes []string  `json:"datasetCodes"`
	CreatedAt    string    `json:"createdAt"`
	StartedAt    string    `json:"startedAt,omitempty"`
	FinishedAt   string    `json:"finishedAt,omitempty"`
	ExitCode     int       `json:"exitCode,omitempty"`
	Error        string    `json:"error,omitempty"`
	Output       string    `json:"output,omitempty"`
}

type Manager struct {
	pythonCmd string
	rootDir   string

	mu   sync.RWMutex
	jobs map[string]ForecastJob
}

func NewManager(pythonCmd string, rootDir string) *Manager {
	return &Manager{
		pythonCmd: pythonCmd,
		rootDir:   rootDir,
		jobs:      make(map[string]ForecastJob),
	}
}

func (m *Manager) Start(datasetCodes []string) (ForecastJob, error) {
	jobID, err := randomID(16)
	if err != nil {
		return ForecastJob{}, err
	}

	normalized := normalizeDatasetCodes(datasetCodes)
	createdAt := nowRFC3339()
	job := ForecastJob{
		ID:           jobID,
		Status:       StatusQueued,
		DatasetCodes: normalized,
		CreatedAt:    createdAt,
	}

	m.mu.Lock()
	m.jobs[jobID] = job
	m.mu.Unlock()

	go m.run(jobID, normalized)
	return job, nil
}

func (m *Manager) Get(jobID string) (ForecastJob, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	job, ok := m.jobs[jobID]
	return job, ok
}

func (m *Manager) run(jobID string, datasetCodes []string) {
	m.update(jobID, func(job ForecastJob) ForecastJob {
		job.Status = StatusRunning
		job.StartedAt = nowRFC3339()
		return job
	})

	scriptPath := filepath.Join("scripts", "generate_forecasts.py")
	args := []string{scriptPath}
	args = append(args, datasetCodes...)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, m.pythonCmd, args...)
	cmd.Dir = m.rootDir
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()
	exitCode := 0
	errText := ""

	if err != nil {
		exitCode = 1
		errText = err.Error()
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}
	if ctx.Err() == context.DeadlineExceeded {
		exitCode = 124
		errText = "forecast generation timed out"
	}

	status := StatusSucceeded
	if exitCode != 0 {
		status = StatusFailed
	}

	m.update(jobID, func(job ForecastJob) ForecastJob {
		job.Status = status
		job.FinishedAt = nowRFC3339()
		job.ExitCode = exitCode
		job.Error = errText
		job.Output = strings.TrimSpace(out.String())
		return job
	})
}

func (m *Manager) update(jobID string, updateFn func(ForecastJob) ForecastJob) {
	m.mu.Lock()
	defer m.mu.Unlock()
	current, ok := m.jobs[jobID]
	if !ok {
		return
	}
	m.jobs[jobID] = updateFn(current)
}

func normalizeDatasetCodes(datasetCodes []string) []string {
	if len(datasetCodes) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(datasetCodes))
	seen := make(map[string]struct{}, len(datasetCodes))
	for _, raw := range datasetCodes {
		code := strings.TrimSpace(raw)
		if code == "" {
			continue
		}
		if len(code) > 80 {
			code = code[:80]
		}
		if _, exists := seen[code]; exists {
			continue
		}
		seen[code] = struct{}{}
		out = append(out, code)
		if len(out) >= 100 {
			break
		}
	}
	return out
}

func randomID(nBytes int) (string, error) {
	buf := make([]byte, nBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
