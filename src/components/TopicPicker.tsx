import { useEffect, useMemo, useState } from 'react';
import { TOPICS } from '../features/dashboard/topicCatalog';
import type { TopicDefinition } from '../features/dashboard/types';

type TopicPickerProps = {
  selectedTopicId: string;
  onSelectedTopicIdChange: (topicId: string) => void;
  onAddTopic: () => void;
  onAddTopicById: (topicId: string) => void;
  onClear: () => void;
  chartCount: number;
  providerId?: string;
  topics?: TopicDefinition[];
  catalogPath?: string;
  popularPath?: string;
  badgeText?: string;
  titleText?: string;
  descriptionText?: string;
};

type CatalogEntry = {
  code: string;
  title: string;
  raw?: Record<string, unknown>;
};

const USAGE_STORAGE_KEY = 'dashboard.topicUsageByProvider';

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeCatalogEntry(item: unknown): CatalogEntry | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;

  const code =
    (typeof record.code === 'string' && record.code) ||
    (typeof record.datasetCode === 'string' && record.datasetCode) ||
    (typeof record.id === 'string' && record.id) ||
    '';

  const title =
    (typeof record.title === 'string' && record.title) ||
    (typeof record.name === 'string' && record.name) ||
    (typeof record.display_name === 'string' && record.display_name) ||
    code;

  if (!code) return null;
  return { code, title, raw: record };
}

function getOfficialPopularityScore(entry: CatalogEntry): number | null {
  const raw = entry.raw;
  if (!raw) return null;

  const featured =
    raw.featured === true ||
    raw.is_featured === true ||
    raw.most_viewed === true ||
    raw.is_most_viewed === true;

  const numericFields = [
    'popularity',
    'popularity_score',
    'featured_rank',
    'most_viewed_rank',
    'view_count',
    'views',
    'download_count',
    'downloads',
    'hits',
  ];

  let score = featured ? 1_000_000 : 0;
  let hasOfficialSignal = featured;

  for (const field of numericFields) {
    const value = toNumber(raw[field]);
    if (value === null) continue;
    hasOfficialSignal = true;
    // Lower rank values are better, so invert them.
    if (field.endsWith('_rank') || field === 'featured_rank' || field === 'most_viewed_rank') {
      score += Math.max(0, 100_000 - value);
    } else {
      score += value;
    }
  }

  return hasOfficialSignal ? score : null;
}

function getProviderProxyScore(providerId: string, entry: CatalogEntry): number | null {
  const raw = entry.raw;
  if (!raw) return null;

  if (providerId === 'openalex') {
    const worksCount = toNumber(raw.works_count) ?? 0;
    const citedByCount = toNumber(raw.cited_by_count) ?? 0;
    if (worksCount === 0 && citedByCount === 0) return null;
    return Math.log10(worksCount + 1) * 0.35 + Math.log10(citedByCount + 1) * 0.65;
  }

  return null;
}

function readUsageByProvider(providerId: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, number>>;
    const providerUsage = parsed?.[providerId];
    if (!providerUsage || typeof providerUsage !== 'object') return {};
    return providerUsage;
  } catch {
    return {};
  }
}

function incrementUsage(providerId: string, code: string): void {
  if (typeof window === 'undefined' || !code) return;
  try {
    const raw = window.localStorage.getItem(USAGE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {};
    const providerUsage = parsed[providerId] ?? {};
    providerUsage[code] = (providerUsage[code] ?? 0) + 1;
    parsed[providerId] = providerUsage;
    window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore telemetry write failures.
  }
}

export function TopicPicker({
  selectedTopicId,
  onSelectedTopicIdChange,
  onAddTopic,
  onAddTopicById,
  onClear,
  chartCount,
  providerId = 'eurostat',
  topics = TOPICS,
  catalogPath = 'catalog.json',
  popularPath,
  badgeText = 'Eurostat dashboard builder',
  titleText = 'Europe statistics dashboard',
  descriptionText =
    'Choose a topic and add it to the dashboard. Each chart pulls live Eurostat data for Europe countries, with the EU aggregate shown alongside when available.',
}: TopicPickerProps) {
  const [customCode, setCustomCode] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [popularCatalog, setPopularCatalog] = useState<CatalogEntry[]>([]);
  const [usageByCode, setUsageByCode] = useState<Record<string, number>>({});

  const topicCodeById = useMemo(
    () =>
      Object.fromEntries(
        topics.map((topic) => [topic.id, topic.datasetCode]),
      ) as Record<string, string>,
    [topics],
  );

  function resolveTrackCode(topicOrCode: string): string {
    return topicCodeById[topicOrCode] ?? topicOrCode;
  }

  function trackDatasetUsage(topicOrCode: string): void {
    const code = resolveTrackCode(topicOrCode).trim();
    if (!code) return;
    incrementUsage(providerId, code);
    setUsageByCode((current) => ({
      ...current,
      [code]: (current[code] ?? 0) + 1,
    }));
  }

  const searchLower = customCode.trim().toLowerCase();
  const suggestions = Array.from(
    new Map(
      catalog
        .filter((entry) =>
          searchLower.length > 0
            ? entry.code.toLowerCase().includes(searchLower) || entry.title.toLowerCase().includes(searchLower)
            : false,
        )
        // Use the code as unique key — prevents duplicates in the suggestion list.
        .map((entry) => [entry.code, entry]),
    ).values(),
  ).slice(0, 10);

  const popularTopics = useMemo(() => {
    const catalogByCode = new Map(catalog.map((entry) => [entry.code, entry]));

    const officialRanked = catalog
      .map((entry) => ({ entry, score: getOfficialPopularityScore(entry) }))
      .filter((entry): entry is { entry: CatalogEntry; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ entry }) => entry);

    if (officialRanked.length > 0) {
      return officialRanked.map((entry) => ({
        id: entry.code,
        title: entry.title,
        datasetCode: entry.code,
      }));
    }

    const proxyRanked = catalog
      .map((entry) => ({ entry, score: getProviderProxyScore(providerId, entry) }))
      .filter((entry): entry is { entry: CatalogEntry; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ entry }) => entry);

    if (proxyRanked.length > 0) {
      return proxyRanked.map((entry) => ({
        id: entry.code,
        title: entry.title,
        datasetCode: entry.code,
      }));
    }

    const blended = new Map<string, CatalogEntry>();
    for (const entry of popularCatalog) blended.set(entry.code, entry);
    for (const topic of topics) {
      const fallback = catalogByCode.get(topic.datasetCode) ?? {
        code: topic.datasetCode,
        title: topic.title,
      };
      if (!blended.has(fallback.code)) blended.set(fallback.code, fallback);
    }

    const rankedByUsage = Array.from(blended.values())
      .map((entry, index) => {
        const usage = usageByCode[entry.code] ?? 0;
        // Prefer curated ordering when usage is equal.
        const curatedBoost = popularCatalog.some((curated) => curated.code === entry.code) ? 100 : 0;
        return {
          entry,
          score: usage * 1000 + curatedBoost - index,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ entry }) => entry);

    return rankedByUsage.map((entry) => ({
      id: entry.code,
      title: entry.title,
      datasetCode: entry.code,
    }));
  }, [catalog, popularCatalog, providerId, topics, usageByCode]);

  useEffect(() => {
    setUsageByCode(readUsageByProvider(providerId));
  }, [providerId]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}${catalogPath}`)
      .then((res) => res.json())
      .then((data) => {
        const entries = Array.isArray(data)
          ? data.map(normalizeCatalogEntry).filter((entry): entry is CatalogEntry => entry !== null)
          : [];
        setCatalog(entries);
      })
      .catch(() => {
        /* ignore */
      });
  }, [catalogPath]);

  useEffect(() => {
    if (!popularPath) {
      setPopularCatalog([]);
      return;
    }

    fetch(`${import.meta.env.BASE_URL}${popularPath}`)
      .then((res) => res.json())
      .then((data) => {
        const entries = Array.isArray(data)
          ? data.map(normalizeCatalogEntry).filter((entry): entry is CatalogEntry => entry !== null)
          : [];
        setPopularCatalog(entries);
      })
      .catch(() => {
        setPopularCatalog([]);
      });
  }, [popularPath]);

  return (
    <section className="batcave-panel relative z-30 rounded-3xl p-6 shadow-card backdrop-blur-xl">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="pixel-badge inline-flex rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.24em]">
            {badgeText}
          </div>
          <h1 className="bat-title text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {titleText}
          </h1>
          <p className="text-sm leading-7 text-slate-300 sm:text-base">
            {descriptionText}
          </p>
        </div>

        <div className="w-full xl:max-w-3xl">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex min-w-[16rem] flex-1 flex-col gap-2 text-sm text-slate-300">
                Topic
                <select
                  value={selectedTopicId}
                  onChange={(event) => onSelectedTopicIdChange(event.target.value)}
                  className="bat-input h-12 rounded-2xl px-4 text-white outline-none transition"
                >
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                  onClick={() => {
                    trackDatasetUsage(selectedTopicId);
                    onAddTopic();
                  }}
                className="bat-btn bat-btn-primary h-12 rounded-2xl px-6 font-medium"
              >
                Add chart
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="relative min-w-[16rem] flex-1">
                  <input
                    type="text"
                    value={customCode}
                    onChange={(event) => setCustomCode(event.target.value)}
                    placeholder="Search catalog or enter code"
                    className="bat-input h-12 w-full rounded-2xl px-4 text-white outline-none transition"
                  />

                  {suggestions.length > 0 ? (
                    <div className="bat-suggestions absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-auto rounded-2xl p-3 text-sm text-slate-200 backdrop-blur">
                      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Suggestions</div>
                      <ul className="space-y-1">
                        {suggestions.map((entry) => (
                          <li key={entry.code}>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomCode(entry.code);
                                onSelectedTopicIdChange(entry.code);
                                trackDatasetUsage(entry.code);
                                onAddTopicById(entry.code);
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
                    onSelectedTopicIdChange(code);
                    trackDatasetUsage(code);
                    onAddTopicById(code);
                    setCustomCode('');
                  }}
                  className="bat-btn h-12 rounded-2xl px-5 font-medium"
                >
                  Add by code
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={chartCount === 0}
                  className="bat-btn h-12 rounded-2xl px-5 font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear all
                </button>
              </div>

              {popularTopics.length > 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Popular datasets</div>
                  <div className="flex flex-wrap gap-2">
                    {popularTopics.map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => {
                          onSelectedTopicIdChange(topic.id);
                          trackDatasetUsage(topic.id);
                          onAddTopicById(topic.id);
                        }}
                        className="bat-btn rounded-2xl px-3 py-2 text-left text-xs"
                        title={`${topic.datasetCode} - ${topic.title}`}
                      >
                        <span className="font-semibold">{topic.title}</span>{' '}
                        <span className="text-slate-300">({topic.datasetCode})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
