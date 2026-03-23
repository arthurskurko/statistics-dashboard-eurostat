package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type DefaultChartSet struct {
	UserID    string   `json:"userId"`
	Dashboard string   `json:"dashboard"`
	TopicIDs  []string `json:"topicIds"`
	UpdatedAt string   `json:"updatedAt"`
}

type DefaultChartStore struct {
	db *sql.DB
}

func NewDefaultChartStore(db *sql.DB) *DefaultChartStore {
	return &DefaultChartStore{db: db}
}

func (s *DefaultChartStore) Init() error {
	const schema = `
CREATE TABLE IF NOT EXISTS default_chart_sets (
    user_id TEXT NOT NULL,
    dashboard TEXT NOT NULL,
    topic_ids TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, dashboard)
);`
	_, err := s.db.Exec(schema)
	return err
}

func (s *DefaultChartStore) Get(ctx context.Context, userID string, dashboard string) (DefaultChartSet, error) {
	const query = `
SELECT topic_ids, updated_at
FROM default_chart_sets
WHERE user_id = ? AND dashboard = ?`

	set := DefaultChartSet{
		UserID:    normalizeUserID(userID),
		Dashboard: normalizeDashboard(dashboard),
		TopicIDs:  []string{},
	}

	var rawTopicIDs string
	var updatedAt string
	err := s.db.QueryRowContext(ctx, query, set.UserID, set.Dashboard).Scan(&rawTopicIDs, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return set, nil
	}
	if err != nil {
		return DefaultChartSet{}, err
	}

	if err := json.Unmarshal([]byte(rawTopicIDs), &set.TopicIDs); err != nil {
		set.TopicIDs = []string{}
	}
	set.UpdatedAt = updatedAt
	return set, nil
}

func (s *DefaultChartStore) Upsert(ctx context.Context, in DefaultChartSet) (DefaultChartSet, error) {
	set := DefaultChartSet{
		UserID:    normalizeUserID(in.UserID),
		Dashboard: normalizeDashboard(in.Dashboard),
		TopicIDs:  sanitizeTopicIDs(in.TopicIDs),
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}

	rawTopicIDs, err := json.Marshal(set.TopicIDs)
	if err != nil {
		return DefaultChartSet{}, err
	}

	const upsert = `
INSERT INTO default_chart_sets (user_id, dashboard, topic_ids, updated_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(user_id, dashboard)
DO UPDATE SET
    topic_ids = excluded.topic_ids,
    updated_at = excluded.updated_at`

	if _, err := s.db.ExecContext(ctx, upsert, set.UserID, set.Dashboard, string(rawTopicIDs), set.UpdatedAt); err != nil {
		return DefaultChartSet{}, err
	}

	return set, nil
}

func normalizeUserID(userID string) string {
	trimmed := strings.TrimSpace(userID)
	if trimmed == "" {
		return "anonymous"
	}
	if len(trimmed) > 120 {
		return trimmed[:120]
	}
	return trimmed
}

func normalizeDashboard(dashboard string) string {
	trimmed := strings.TrimSpace(strings.ToLower(dashboard))
	if trimmed == "" {
		return "eurostat"
	}
	if len(trimmed) > 60 {
		return trimmed[:60]
	}
	return trimmed
}

func sanitizeTopicIDs(topicIDs []string) []string {
	if len(topicIDs) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(topicIDs))
	seen := make(map[string]struct{}, len(topicIDs))
	for _, raw := range topicIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if len(id) > 120 {
			id = id[:120]
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
		if len(out) >= 200 {
			break
		}
	}
	return out
}
