import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { EmptyState } from './components/EmptyState';
import { StatChip } from './components/StatChip';
import { TopicPicker } from './components/TopicPicker';
import { THEMES, type ThemeId } from './features/dashboard/themes';
import { TOPICS, TOPIC_MAP } from './features/dashboard/topicCatalog';
import type { TopicDefinition } from './features/dashboard/types';
import { OPEN_METEO_TOPICS, OPEN_METEO_TOPIC_MAP } from './features/dashboard/openMeteoTopicCatalog';
import { WHO_TOPICS, WHO_TOPIC_MAP } from './features/dashboard/whoTopicCatalog';
import { WORLD_BANK_TOPICS, WORLD_BANK_TOPIC_MAP } from './features/dashboard/worldBankTopicCatalog';
import { useLocalStorage } from './hooks/useLocalStorage';
import { fetchTopicData } from './lib/eurostat';
import { fetchOpenMeteoTopicData } from './lib/openMeteo';
import { fetchWhoTopicData } from './lib/who';
import { fetchWorldBankTopicData } from './lib/worldBank';

type ProviderId = 'eurostat' | 'worldbank' | 'who' | 'openmeteo';

type UnifiedDashboardCard = {
  id: string;
  providerId: ProviderId;
  topicId: string;
  createdAt: number;
};

type ProviderConfig = {
  id: ProviderId;
  label: string;
  themeId: ThemeId;
  title: string;
  badgeText: string;
  descriptionText: string;
  sourceLabel: string;
  fallbackDescriptionPrefix: string;
  sourceLinkLabel: string;
  catalogPath: string;
  popularPath: string;
  topics: TopicDefinition[];
  topicMap: Record<string, TopicDefinition>;
  defaultGeoValues: string[];
  sourceUrlBuilder: (datasetCode: string) => string;
  fetchTopicDataFn: (
    topicId: string,
    options?: {
      forecastHorizon?: number;
      filters?: Record<string, string | string[]>;
      seriesDimension?: string;
      geoValues?: string[];
    },
  ) => ReturnType<typeof fetchTopicData>;
  forecastOptions?: number[];
  forecastUnitLabel?: string;
};

const STORAGE_KEY = 'unified-statistics-dashboard.cards.v1';
const THEME_STORAGE_KEY = 'unified-statistics-dashboard.theme';

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'eurostat',
    label: 'Eurostat',
    themeId: 'ember-noir',
    title: 'Eurostat indicators',
    badgeText: 'Eurostat dashboard builder',
    descriptionText:
      'Choose a Eurostat topic and add it to a mixed dashboard while preserving provider-specific controls.',
    sourceLabel: 'Eurostat',
    fallbackDescriptionPrefix: 'Eurostat dataset',
    sourceLinkLabel: 'Eurostat dataset',
    catalogPath: 'catalog.json',
    popularPath: 'popular-eurostat.json',
    topics: TOPICS,
    topicMap: TOPIC_MAP,
    defaultGeoValues: ['EE', 'EU27_2020'],
    sourceUrlBuilder: (datasetCode: string) =>
      `https://ec.europa.eu/eurostat/databrowser/view/${datasetCode}/default/table?lang=en`,
    fetchTopicDataFn: fetchTopicData,
  },
  {
    id: 'worldbank',
    label: 'World Bank',
    themeId: 'neon-grid',
    title: 'World Bank indicators',
    badgeText: 'World Bank dashboard builder',
    descriptionText:
      'Search World Bank indicator codes and add them next to Eurostat, WHO, and Open-Meteo charts.',
    sourceLabel: 'World Bank',
    fallbackDescriptionPrefix: 'World Bank indicator',
    sourceLinkLabel: 'World Bank indicator',
    catalogPath: 'worldbank-catalog.json',
    popularPath: 'popular-worldbank.json',
    topics: WORLD_BANK_TOPICS,
    topicMap: WORLD_BANK_TOPIC_MAP,
    defaultGeoValues: ['EST', 'EUU'],
    sourceUrlBuilder: (datasetCode: string) => `https://data.worldbank.org/indicator/${datasetCode}`,
    fetchTopicDataFn: fetchWorldBankTopicData,
  },
  {
    id: 'who',
    label: 'WHO',
    themeId: 'aurora-core',
    title: 'WHO indicators',
    badgeText: 'WHO dashboard builder',
    descriptionText: 'Search WHO indicator codes and compare Estonia with regional or global benchmarks.',
    sourceLabel: 'WHO GHO OData',
    fallbackDescriptionPrefix: 'WHO indicator',
    sourceLinkLabel: 'WHO indicator',
    catalogPath: 'who-catalog.json',
    popularPath: 'popular-who.json',
    topics: WHO_TOPICS,
    topicMap: WHO_TOPIC_MAP,
    defaultGeoValues: ['EST', 'EUR'],
    sourceUrlBuilder: (datasetCode: string) => `https://ghoapi.azureedge.net/api/${datasetCode}`,
    fetchTopicDataFn: fetchWhoTopicData,
  },
  {
    id: 'openmeteo',
    label: 'Open-Meteo',
    themeId: 'mystic-forest',
    title: 'Open-Meteo variables',
    badgeText: 'Open-Meteo dashboard builder',
    descriptionText: 'Add climate and weather variables to the same dashboard alongside socioeconomic indicators.',
    sourceLabel: 'Open-Meteo',
    fallbackDescriptionPrefix: 'Open-Meteo variable',
    sourceLinkLabel: 'Open-Meteo docs',
    catalogPath: 'openmeteo-catalog.json',
    popularPath: 'popular-openmeteo.json',
    topics: OPEN_METEO_TOPICS,
    topicMap: OPEN_METEO_TOPIC_MAP,
    defaultGeoValues: ['TLL', 'HEL'],
    sourceUrlBuilder: () => 'https://open-meteo.com/en/docs',
    fetchTopicDataFn: fetchOpenMeteoTopicData,
    forecastOptions: [7, 14, 20, 30, 60, 90, 120, 180],
    forecastUnitLabel: 'd',
  },
];

const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map((provider) => [provider.id, provider])) as Record<
  ProviderId,
  ProviderConfig
>;

function createCard(providerId: ProviderId, topicId: string): UnifiedDashboardCard {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${providerId}-${topicId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    providerId,
    topicId,
    createdAt: Date.now(),
  };
}

export default function UnifiedDashboardApp() {
  const basePath = import.meta.env.BASE_URL;
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>('eurostat');
  const selectedProvider = PROVIDER_MAP[selectedProviderId];

  const [selectedTopicId, setSelectedTopicId] = useState<string>(selectedProvider.topics[0]?.id ?? '');
  const [cards, setCards] = useLocalStorage<UnifiedDashboardCard[]>(STORAGE_KEY, []);
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'ember-noir');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  useEffect(() => {
    const firstTopicId = selectedProvider.topics[0]?.id ?? '';
    setSelectedTopicId((current) => {
      if (!current) return firstTopicId;
      if (selectedProvider.topicMap[current]) return current;
      return firstTopicId;
    });
  }, [selectedProvider]);

  const removeCard = useCallback(
    (cardId: string) => {
      setCards((currentCards) => currentCards.filter((entry) => entry.id !== cardId));
    },
    [setCards],
  );

  function addCard() {
    if (!selectedTopicId) return;
    setCards((currentCards) => [createCard(selectedProviderId, selectedTopicId), ...currentCards]);
  }

  function addCardForTopicId(topicId: string) {
    if (!topicId) return;
    setCards((currentCards) => [createCard(selectedProviderId, topicId), ...currentCards]);
  }

  function clearCards() {
    setCards([]);
  }

  const activeProviders = useMemo(() => new Set(cards.map((card) => card.providerId)), [cards]);

  return (
    <div className="batcave-page min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="batcave-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-300">Interface theme</div>

          <label className="flex items-center gap-2 text-sm text-slate-200">
            <span className="text-slate-300">Mode</span>
            <select
              value={themeId}
              onChange={(event) => setThemeId(event.target.value as ThemeId)}
              className="bat-input rounded-xl px-3 py-2 text-sm text-white outline-none"
            >
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a href={basePath} className="bat-btn rounded-2xl px-3 py-1 font-medium">
              Eurostat
            </a>
            <a href={`${basePath}worldbank`} className="bat-btn rounded-2xl px-3 py-1 font-medium">
              World Bank
            </a>
            <a href={`${basePath}who`} className="bat-btn rounded-2xl px-3 py-1 font-medium">
              WHO
            </a>
            <a href={`${basePath}meteo`} className="bat-btn rounded-2xl px-3 py-1 font-medium">
              Open-Meteo
            </a>
            <span className="rounded-2xl border border-white/20 bg-white/10 px-3 py-1 font-medium text-white">
              Unified
            </span>
          </div>
        </section>

        <section data-theme={selectedProvider.themeId} className="batcave-panel rounded-2xl px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-300">Data source for next chart</div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <span className="text-slate-300">Source</span>
              <select
                value={selectedProviderId}
                onChange={(event) => setSelectedProviderId(event.target.value as ProviderId)}
                className="bat-input rounded-xl px-3 py-2 text-sm text-white outline-none"
              >
                {PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div data-theme={selectedProvider.themeId}>
          <TopicPicker
            selectedTopicId={selectedTopicId}
            onSelectedTopicIdChange={setSelectedTopicId}
            onAddTopic={addCard}
            onAddTopicById={addCardForTopicId}
            onClear={clearCards}
            chartCount={cards.length}
            providerId={selectedProvider.id}
            topics={selectedProvider.topics}
            catalogPath={selectedProvider.catalogPath}
            popularPath={selectedProvider.popularPath}
            badgeText={selectedProvider.badgeText}
            titleText={selectedProvider.title}
            descriptionText={selectedProvider.descriptionText}
          />
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatChip label="Charts on dashboard" value={cards.length} />
          <StatChip label="Source for next chart" value={selectedProvider.label} />
          <StatChip label="Topics in selected source" value={selectedProvider.topics.length} />
          <StatChip label="Sources represented" value={activeProviders.size} />
        </section>

        {cards.length === 0 ? <EmptyState /> : null}

        {cards.length > 0 ? (
          <section className="grid gap-6 xl:grid-cols-2">
            {cards.map((card) => {
              const provider = PROVIDER_MAP[card.providerId];

              return (
                <div key={card.id} className="relative" data-theme={provider.themeId}>
                  <div className="pointer-events-none absolute left-4 top-3 z-20">
                    <span className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur">
                      {provider.label}
                    </span>
                  </div>

                  <ChartCard
                    cardId={card.id}
                    topicId={card.topicId}
                    onRemove={removeCard}
                    providerId={provider.id}
                    providerName={provider.label}
                    topicMap={provider.topicMap}
                    fetchTopicDataFn={provider.fetchTopicDataFn}
                    defaultGeoValues={provider.defaultGeoValues}
                    fallbackDescriptionPrefix={provider.fallbackDescriptionPrefix}
                    sourceUrlBuilder={provider.sourceUrlBuilder}
                    sourceLinkLabel={provider.sourceLinkLabel}
                    supportsForecast
                    forecastOptions={provider.forecastOptions}
                    forecastUnitLabel={provider.forecastUnitLabel}
                  />
                </div>
              );
            })}
          </section>
        ) : null}
      </div>
    </div>
  );
}
