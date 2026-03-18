import { useEffect, useMemo, useState } from 'react';
import { TOPIC_MAP, TOPICS } from '../features/dashboard/topicCatalog';
import type { TopicDefinition } from '../features/dashboard/types';

export type FetchStats = Record<
  string,
  {
    lastFetch: string;
    lastForecast?: string;
    forecastHorizon?: number;
    forecastDisabledReason?: string;
  }
>;

export type AdminPanelProps = {
  defaultTopicIds: string[];
  setDefaultTopicIds: React.Dispatch<React.SetStateAction<string[]>>;
  onLoadDefaults: () => void;
  onClearDashboard: () => void;
  onClose: () => void;
};

const DEFAULT_TOPIC_IDS = ['population', 'unemployment-rate', 'inflation'];

const STATS_STORAGE_KEY = 'estonia-statistics-dashboard.stats';

function formatRelative(dateIso: string | undefined): string {
  if (!dateIso) return '—';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '—';

  const deltaSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function readStats(): FetchStats {
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FetchStats;
  } catch {
    return {};
  }
}

type CatalogEntry = {
  code: string;
  title: string;
};

export function AdminPanel({
  defaultTopicIds,
  setDefaultTopicIds,
  onLoadDefaults,
  onClearDashboard,
  onClose,
}: AdminPanelProps) {
  const [stats, setStats] = useState<FetchStats>(() => readStats());
  const [selectedTopicId, setSelectedTopicId] = useState(defaultTopicIds[0] ?? TOPICS[0]?.id ?? '');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [customCode, setCustomCode] = useState('');

  const defaultTopics = useMemo(() => {
    return defaultTopicIds
      .map((id) =>
        TOPIC_MAP[id] ?? {
          id,
          title: id,
          description: id,
          datasetCode: id,
          filters: {},
          sourceUrl: '',
          pubmed: {
            availability: 'unchecked',
            searchTerm: id,
          },
        },
      )
      .filter(Boolean) as TopicDefinition[];
  }, [defaultTopicIds]);

  useEffect(() => {
    const listener = () => setStats(readStats());
    window.addEventListener('dashboard:stats-updated', listener);
    return () => window.removeEventListener('dashboard:stats-updated', listener);
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}catalog.json`)
      .then((res) => res.json())
      .then((data) => setCatalog(data))
      .catch(() => {
        /* ignore */
      });
  }, []);

  const handleAddDefault = () => {
    if (!selectedTopicId) return;
    setDefaultTopicIds((existing) => Array.from(new Set([...existing, selectedTopicId])));
  };

  const handleAddDefaultByCode = (code: string) => {
    if (!code) return;
    setDefaultTopicIds((existing) => Array.from(new Set([...existing, code])));
  };

  const handleRemoveDefault = (topicId: string) => {
    setDefaultTopicIds((existing) => existing.filter((id) => id !== topicId));
  };

  const handleResetDefaults = () => {
    setDefaultTopicIds(DEFAULT_TOPIC_IDS);
  };

  const topicRows = TOPICS.map((topic) => {
    const stat = stats[topic.id];
    return (
      <tr key={topic.id} className="border-b border-white/10">
        <td className="px-3 py-2 text-left text-xs text-slate-100">{topic.title}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-200">{formatRelative(stat?.lastFetch)}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-200">{formatRelative(stat?.lastForecast)}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-200">{stat?.forecastHorizon ?? '—'}</td>
        <td className="px-3 py-2 text-xs text-slate-300">{stat?.forecastDisabledReason ?? '—'}</td>
      </tr>
    );
  });

  return (
    <div className="batcave-page min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="batcave-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Admin</div>
            <div className="text-xs text-slate-300">Manage default charts and view dataset fetch stats.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
            >
              Back to dashboard
            </button>
            <button
              type="button"
              onClick={onClearDashboard}
              className="bat-btn bat-btn-danger rounded-2xl px-3 py-1 text-xs font-medium"
            >
              Clear dashboard
            </button>
          </div>
        </section>

        <section className="batcave-panel rounded-2xl px-5 py-5">
          <h2 className="text-sm font-semibold text-white">Default charts</h2>
          <p className="mt-1 text-xs text-slate-300">
            Charts in this list are automatically added to the dashboard when it’s empty.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Current defaults</h3>
              {defaultTopics.length === 0 ? (
                <p className="mt-2 text-xs text-slate-200">No default charts configured.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {defaultTopics.map((topic) => (
                    <li key={topic.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <span className="text-xs text-slate-200">{topic.title}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDefault(topic.id)}
                        className="text-xs text-rose-200 hover:text-rose-100"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  value={selectedTopicId}
                  onChange={(event) => setSelectedTopicId(event.target.value)}
                  className="bat-input w-full rounded-2xl px-3 py-2 text-sm text-white outline-none"
                >
                  {TOPICS.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddDefault}
                  className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
                >
                  Add
                </button>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Add from catalog
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={customCode}
                      onChange={(event) => setCustomCode(event.target.value)}
                      placeholder="Search catalog or enter code"
                      className="bat-input h-12 w-full rounded-2xl px-4 text-white outline-none transition"
                    />
                    {customCode.trim().length > 0 ? (
                      <div className="bat-suggestions absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-auto rounded-2xl p-3 text-sm text-slate-200 backdrop-blur">
                        <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Suggestions</div>
                        <ul className="space-y-1">
                          {catalog
                            .filter((entry) =>
                              entry.code.toLowerCase().includes(customCode.toLowerCase()) ||
                              entry.title.toLowerCase().includes(customCode.toLowerCase()),
                            )
                            .slice(0, 10)
                            .map((entry) => (
                              <li key={entry.code}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomCode(entry.code);
                                    setSelectedTopicId(entry.code);
                                    handleAddDefaultByCode(entry.code);
                                  }}
                                  className="w-full rounded-lg px-2 py-1 text-left text-xs transition hover:bg-white/10 hover:text-white"
                                >
                                  <span className="font-semibold">{entry.code}</span> - {entry.title}
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const code = customCode.trim();
                      if (!code) return;
                      setSelectedTopicId(code);
                      handleAddDefaultByCode(code);
                      setCustomCode('');
                    }}
                    className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
                  >
                    Add by code
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
                >
                  Restore built-in defaults
                </button>
                <button
                  type="button"
                  onClick={onLoadDefaults}
                  className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
                >
                  Load defaults now
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Fetch stats</h3>
              <p className="mt-1 text-xs text-slate-200">
                Last time data was fetched and when a forecast was generated.
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="px-3 py-2">Topic</th>
                      <th className="px-3 py-2 text-right">Last fetch</th>
                      <th className="px-3 py-2 text-right">Last forecast</th>
                      <th className="px-3 py-2 text-right">Horizon</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>{topicRows}</tbody>
                </table>
              </div>

              <div className="mt-3 text-right">
                <button
                  type="button"
                  onClick={() => setStats(readStats())}
                  className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
                >
                  Refresh stats
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
