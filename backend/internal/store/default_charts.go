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
	UserID                 string                   `json:"userId"`
	Dashboard              string                   `json:"dashboard"`
	TopicIDs               []string                 `json:"topicIds"`
	ChartDefaultsByTopicID map[string]TopicDefaults `json:"chartDefaultsByTopicId,omitempty"`
	UpdatedAt              string                   `json:"updatedAt"`
}

type TopicDefaults struct {
	GeoValues []string `json:"geoValues,omitempty"`
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
    template_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, dashboard)
);`
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}

	const columnCheckQuery = `PRAGMA table_info(default_chart_sets)`
	rows, err := s.db.Query(columnCheckQuery)
	if err != nil {
		return err
	}
	defer rows.Close()

	hasTemplateJSON := false
	for rows.Next() {
		var cid int
		var name string
		var colType string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if name == "template_json" {
			hasTemplateJSON = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if !hasTemplateJSON {
		const alter = `ALTER TABLE default_chart_sets ADD COLUMN template_json TEXT NOT NULL DEFAULT '{}'`
		if _, err := s.db.Exec(alter); err != nil {
			return err
		}
	}

	return nil
}

func (s *DefaultChartStore) Get(ctx context.Context, userID string, dashboard string) (DefaultChartSet, error) {
	const query = `
SELECT topic_ids, template_json, updated_at
FROM default_chart_sets
WHERE user_id = ? AND dashboard = ?`

	set := DefaultChartSet{
		UserID:                 normalizeUserID(userID),
		Dashboard:              normalizeDashboard(dashboard),
		TopicIDs:               []string{},
		ChartDefaultsByTopicID: map[string]TopicDefaults{},
	}

	var rawTopicIDs string
	var rawTemplateJSON string
	var updatedAt string
	err := s.db.QueryRowContext(ctx, query, set.UserID, set.Dashboard).Scan(&rawTopicIDs, &rawTemplateJSON, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return set, nil
	}
	if err != nil {
		return DefaultChartSet{}, err
	}

	if err := json.Unmarshal([]byte(rawTopicIDs), &set.TopicIDs); err != nil {
		set.TopicIDs = []string{}
	}
	if err := json.Unmarshal([]byte(rawTemplateJSON), &set.ChartDefaultsByTopicID); err != nil {
		set.ChartDefaultsByTopicID = map[string]TopicDefaults{}
	}
	set.ChartDefaultsByTopicID = sanitizeTopicDefaults(set.ChartDefaultsByTopicID, set.TopicIDs)
	set.UpdatedAt = updatedAt
	return set, nil
}

func (s *DefaultChartStore) Upsert(ctx context.Context, in DefaultChartSet) (DefaultChartSet, error) {
	set := DefaultChartSet{
		UserID:                 normalizeUserID(in.UserID),
		Dashboard:              normalizeDashboard(in.Dashboard),
		TopicIDs:               sanitizeTopicIDs(in.TopicIDs),
		ChartDefaultsByTopicID: map[string]TopicDefaults{},
		UpdatedAt:              time.Now().UTC().Format(time.RFC3339),
	}
	set.ChartDefaultsByTopicID = sanitizeTopicDefaults(in.ChartDefaultsByTopicID, set.TopicIDs)

	rawTopicIDs, err := json.Marshal(set.TopicIDs)
	if err != nil {
		return DefaultChartSet{}, err
	}

	rawTemplateJSON, err := json.Marshal(set.ChartDefaultsByTopicID)
	if err != nil {
		return DefaultChartSet{}, err
	}

	const upsert = `
INSERT INTO default_chart_sets (user_id, dashboard, topic_ids, template_json, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_id, dashboard)
DO UPDATE SET
    topic_ids = excluded.topic_ids,
    template_json = excluded.template_json,
    updated_at = excluded.updated_at`

	if _, err := s.db.ExecContext(ctx, upsert, set.UserID, set.Dashboard, string(rawTopicIDs), string(rawTemplateJSON), set.UpdatedAt); err != nil {
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

func sanitizeTopicDefaults(defaults map[string]TopicDefaults, allowedTopicIDs []string) map[string]TopicDefaults {
	if len(defaults) == 0 || len(allowedTopicIDs) == 0 {
		return map[string]TopicDefaults{}
	}

	allowed := make(map[string]struct{}, len(allowedTopicIDs))
	for _, topicID := range allowedTopicIDs {
		allowed[topicID] = struct{}{}
	}

	out := make(map[string]TopicDefaults, len(defaults))
	for rawTopicID, rawDefaults := range defaults {
		topicID := strings.TrimSpace(rawTopicID)
		if topicID == "" {
			continue
		}
		if _, ok := allowed[topicID]; !ok {
			continue
		}

		geoValues := make([]string, 0, len(rawDefaults.GeoValues))
		seenGeo := make(map[string]struct{}, len(rawDefaults.GeoValues))
		for _, rawGeo := range rawDefaults.GeoValues {
			geo := strings.TrimSpace(rawGeo)
			if geo == "" {
				continue
			}
			if len(geo) > 20 {
				geo = geo[:20]
			}
			if _, exists := seenGeo[geo]; exists {
				continue
			}
			seenGeo[geo] = struct{}{}
			geoValues = append(geoValues, geo)
			if len(geoValues) >= 12 {
				break
			}
		}

		if len(geoValues) == 0 {
			continue
		}

		out[topicID] = TopicDefaults{GeoValues: geoValues}
	}

	return out
}
