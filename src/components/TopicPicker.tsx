import { useEffect, useMemo, useState } from 'react';
import { CatalogCodeSearch } from './CatalogCodeSearch';
import { TOPICS } from '../features/dashboard/topicCatalog';
import type { TopicDefinition } from '../features/dashboard/types';
import { loadCatalogEntries, type CatalogEntry } from '../lib/catalog';
import { searchWorldBankIndicators } from '../lib/worldBankCatalogSearch';

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

const USAGE_STORAGE_KEY = 'dashboard.topicUsageByProvider';
const WORLD_BANK_API_SEARCH_MIN_CHARS = 3;
const WORLD_BANK_API_SEARCH_DEBOUNCE_MS = 350;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

function getWorldBankTopicNames(entry: CatalogEntry): string[] {
  const raw = entry.raw;
  if (!raw || typeof raw !== 'object') return [];

  const topicNames = raw.topicNames;
  if (Array.isArray(topicNames)) {
    return Array.from(
      new Set(
        topicNames
          .map((topic) => (typeof topic === 'string' ? topic.trim() : ''))
          .filter((topic) => topic.length > 0),
      ),
    );
  }

  const topics = raw.topics;
  if (!Array.isArray(topics)) return [];

  return Array.from(
    new Set(
      topics
        .map((topic) => {
          if (!topic || typeof topic !== 'object') return '';
          const value = (topic as Record<string, unknown>).value;
          return typeof value === 'string' ? value.trim() : '';
        })
        .filter((topic) => topic.length > 0),
    ),
  );
}

function matchesWorldBankTopicFilter(entry: CatalogEntry, selectedTopic: string): boolean {
  if (!selectedTopic || selectedTopic === 'all') return true;
  return getWorldBankTopicNames(entry).some((topic) => topic.toLowerCase() === selectedTopic.toLowerCase());
}

function dedupeCatalogEntries(entries: CatalogEntry[]): CatalogEntry[] {
  return Array.from(new Map(entries.map((entry) => [entry.code, entry])).values());
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
  const isWorldBankProvider = providerId === 'worldbank';
  const [customCode, setCustomCode] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [popularCatalog, setPopularCatalog] = useState<CatalogEntry[]>([]);
  const [usageByCode, setUsageByCode] = useState<Record<string, number>>({});
  const [selectedCatalogTopic, setSelectedCatalogTopic] = useState('all');
  const [apiSuggestions, setApiSuggestions] = useState<CatalogEntry[]>([]);
  const [apiSearchState, setApiSearchState] = useState<'idle' | 'loading' | 'error'>('idle');

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
  const worldBankTopicOptions = useMemo(() => {
    if (!isWorldBankProvider) return [];

    const topicSet = new Set<string>();
    for (const entry of catalog) {
      for (const topic of getWorldBankTopicNames(entry)) {
        topicSet.add(topic);
      }
    }

    return Array.from(topicSet).sort((a, b) => a.localeCompare(b));
  }, [catalog, isWorldBankProvider]);

  const filteredCatalog = useMemo(
    () =>
      isWorldBankProvider && selectedCatalogTopic !== 'all'
        ? catalog.filter((entry) => matchesWorldBankTopicFilter(entry, selectedCatalogTopic))
        : catalog,
    [catalog, isWorldBankProvider, selectedCatalogTopic],
  );

  const localSuggestions = Array.from(
    new Map(
      filteredCatalog
        .filter((entry) =>
          searchLower.length > 0
            ? entry.code.toLowerCase().includes(searchLower) || entry.title.toLowerCase().includes(searchLower)
            : false,
        )
        // Use the code as unique key — prevents duplicates in the suggestion list.
        .map((entry) => [entry.code, entry]),
    ).values(),
  ).slice(0, 10);

  const suggestions = useMemo(() => {
    if (!isWorldBankProvider) return localSuggestions;

    const topicFilteredApiSuggestions =
      selectedCatalogTopic === 'all'
        ? apiSuggestions
        : apiSuggestions.filter((entry) => matchesWorldBankTopicFilter(entry, selectedCatalogTopic));

    return dedupeCatalogEntries([...localSuggestions, ...topicFilteredApiSuggestions]).slice(0, 10);
  }, [apiSuggestions, isWorldBankProvider, localSuggestions, selectedCatalogTopic]);

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
    if (!isWorldBankProvider) {
      setSelectedCatalogTopic('all');
      setApiSuggestions([]);
      setApiSearchState('idle');
      return;
    }
  }, [isWorldBankProvider]);

  useEffect(() => {
    loadCatalogEntries(catalogPath)
      .then((entries) => {
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

    loadCatalogEntries(popularPath)
      .then((entries) => {
        setPopularCatalog(entries);
      })
      .catch(() => {
        setPopularCatalog([]);
      });
  }, [popularPath]);

  useEffect(() => {
    if (!isWorldBankProvider) return;

    const query = customCode.trim();
    if (query.length < WORLD_BANK_API_SEARCH_MIN_CHARS) {
      setApiSuggestions([]);
      setApiSearchState('idle');
      return;
    }

    let isCancelled = false;
    setApiSearchState('loading');

    const timeoutId = window.setTimeout(() => {
      searchWorldBankIndicators(query, {
        limit: 10,
        topicFilter: selectedCatalogTopic === 'all' ? undefined : selectedCatalogTopic,
      })
        .then((entries) => {
          if (isCancelled) return;
          setApiSuggestions(entries);
          setApiSearchState('idle');
        })
        .catch(() => {
          if (isCancelled) return;
          setApiSuggestions([]);
          setApiSearchState('error');
        });
    }, WORLD_BANK_API_SEARCH_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [customCode, isWorldBankProvider, selectedCatalogTopic]);

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
              <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-slate-300 sm:min-w-[16rem]">
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
              {isWorldBankProvider ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs uppercase tracking-[0.16em] text-slate-300 sm:max-w-sm">
                    Indicator topic
                    <select
                      value={selectedCatalogTopic}
                      onChange={(event) => setSelectedCatalogTopic(event.target.value)}
                      className="bat-input h-11 rounded-2xl px-3 text-sm normal-case tracking-normal text-white outline-none transition"
                    >
                      <option value="all">All topics</option>
                      {worldBankTopicOptions.map((topic) => (
                        <option key={topic} value={topic}>
                          {topic}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="text-xs text-slate-400 sm:pb-1">
                    {customCode.trim().length >= WORLD_BANK_API_SEARCH_MIN_CHARS && apiSearchState === 'loading'
                      ? 'Searching live World Bank API...'
                      : apiSearchState === 'error'
                        ? 'Live API search unavailable, using local fallback catalog.'
                        : `Fallback catalog: ${catalog.length} indicators`}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <CatalogCodeSearch
                  customCode={customCode}
                  onCustomCodeChange={setCustomCode}
                  suggestions={suggestions}
                  inputWrapperClassName="relative min-w-0 flex-1 sm:min-w-[16rem]"
                  onSuggestionSelect={(code) => {
                    setCustomCode(code);
                    onSelectedTopicIdChange(code);
                    trackDatasetUsage(code);
                    onAddTopicById(code);
                  }}
                  onAddByCode={(code) => {
                    onSelectedTopicIdChange(code);
                    trackDatasetUsage(code);
                    onAddTopicById(code);
                    setCustomCode('');
                  }}
                />
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
