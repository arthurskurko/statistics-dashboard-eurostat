import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { ChartCard } from './components/ChartCard';
import { ProviderDashboardLayout } from './components/ProviderDashboardLayout';
import { TopicPicker } from './components/TopicPicker';
import type { ThemeId } from './features/dashboard/themes';
import { WORLD_BANK_TOPICS, WORLD_BANK_TOPIC_MAP } from './features/dashboard/worldBankTopicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useDefaultChartStorage } from './hooks/useDefaultChartStorage';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createDefaultChartsCandidateUrls, loadDefaultChartsFromCandidates } from './lib/defaultCharts';
import { fetchWorldBankTopicData, fetchAvailableGeosForTopic as fetchWorldBankAvailableGeosForTopic } from './lib/worldBank';

const STORAGE_KEY = 'worldbank-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'worldbank-statistics-dashboard.defaultCharts';
const THEME_STORAGE_KEY = 'worldbank-statistics-dashboard.theme';
const DEFAULT_CHART_TOPIC_IDS = [
  'wb-pop-total',
  'wb-unemployment',
  'wb-labor-force-participation',
  'wb-inflation',
];
const WORLD_BANK_DEFAULT_GEOS = ['EST', 'EUU'];
const WORLD_BANK_SOURCE_URL_BUILDER = (datasetCode: string) =>
  `https://data.worldbank.org/indicator/${datasetCode}`;

function createCard(topicId: string, defaultGeoValues?: string[]): DashboardCard {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${topicId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    topicId,
    createdAt: Date.now(),
    defaultGeoValues,
  };
}

export default function WorldBankApp() {
  const basePath = import.meta.env.BASE_URL;
  const backendBaseUrl =
    (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
    'http://localhost:8090';
  const [selectedTopicId, setSelectedTopicId] = useState<string>(WORLD_BANK_TOPICS[0].id);
  const [cards, setCards] = useLocalStorage<DashboardCard[]>(STORAGE_KEY, []);
  const shouldSeedDefaultsRef = useRef(
    typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) === null : false,
  );
  const {
    defaultTopicIds,
    setDefaultTopicIds,
    defaultChartGeoValuesByTopicId,
    setDefaultChartGeoValuesByTopicId,
    backendMode,
    backendStatusMessage,
    isCheckingBackend,
    refreshBackendStatus,
  } = useDefaultChartStorage({
    storageKey: DEFAULT_CHARTS_KEY,
    initialTopicIds: DEFAULT_CHART_TOPIC_IDS,
    backendBaseUrl,
    userId: 'anonymous',
    dashboard: 'worldbank',
  });
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'neon-grid');
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const activeTopics = useMemo(() => new Set(cards.map((card) => card.topicId)), [cards]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  function addCard() {
    setCards((currentCards) => [createCard(selectedTopicId, defaultChartGeoValuesByTopicId[selectedTopicId]), ...currentCards]);
  }

  function addCardForTopicId(topicId: string) {
    setCards((currentCards) => [createCard(topicId, defaultChartGeoValuesByTopicId[topicId]), ...currentCards]);
  }

  function clearCards() {
    setCards([]);
  }

  const addDefaultCards = useCallback(() => {
    setCards((currentCards) => {
      if (currentCards.length > 0) return currentCards;
      return [...defaultTopicIds.map((topicId) => createCard(topicId, defaultChartGeoValuesByTopicId[topicId]))];
    });
  }, [defaultTopicIds, defaultChartGeoValuesByTopicId, setCards]);

  const loadDefaultsFromFileAndAddCards = useCallback(async () => {
    const dashboard = 'worldbank';
    const userId = 'anonymous';
    const candidates = createDefaultChartsCandidateUrls(basePath, dashboard, userId);

    const parsed = await loadDefaultChartsFromCandidates(candidates, dashboard);
    if (parsed) {
      const mapped: Record<string, string[]> = {};
      if (parsed.chartDefaultsByTopicId && typeof parsed.chartDefaultsByTopicId === 'object') {
        for (const topicId of parsed.topicIds ?? []) {
          const tpl = parsed.chartDefaultsByTopicId[topicId];
          if (Array.isArray(tpl)) {
            mapped[topicId] = tpl.filter((v: unknown): v is string => typeof v === 'string');
            continue;
          }
          const geo = (tpl as any)?.geoValues;
          mapped[topicId] = Array.isArray(geo)
            ? geo.filter((v: unknown): v is string => typeof v === 'string')
            : [];
        }
      } else {
        for (const topicId of parsed.topicIds ?? []) {
          mapped[topicId] = [];
        }
      }
      setDefaultChartGeoValuesByTopicId(mapped);
      setDefaultTopicIds(parsed.topicIds);
      setCards(parsed.topicIds.map((topicId: string) => createCard(topicId, mapped[topicId])));
      return;
    }

    addDefaultCards();
  }, [addDefaultCards, basePath, setCards, setDefaultChartGeoValuesByTopicId, setDefaultTopicIds]);

  useEffect(() => {
    if (!shouldSeedDefaultsRef.current || cards.length > 0 || isCheckingBackend) {
      return;
    }

    const seedDefaults = async () => {
      try {
        await loadDefaultsFromFileAndAddCards();
      } finally {
        shouldSeedDefaultsRef.current = false;
      }
    };

    void seedDefaults();
  }, [cards.length, isCheckingBackend, loadDefaultsFromFileAndAddCards]);

  const removeCard = useCallback((cardId: string) => {
    setCards((currentCards) => currentCards.filter((entry) => entry.id !== cardId));
  }, [setCards]);

  if (isAdminOpen) {
    return (
      <AdminPanel
        defaultTopicIds={defaultTopicIds}
        setDefaultTopicIds={setDefaultTopicIds}
        defaultChartGeoValuesByTopicId={defaultChartGeoValuesByTopicId}
        setDefaultChartGeoValuesByTopicId={setDefaultChartGeoValuesByTopicId}
        backendMode={backendMode}
        backendStatusMessage={backendStatusMessage}
        backendBaseUrl={backendBaseUrl}
        onRefreshBackendStatus={refreshBackendStatus}
        isRefreshingBackendStatus={isCheckingBackend}
        topics={WORLD_BANK_TOPICS}
        topicMap={WORLD_BANK_TOPIC_MAP}
        defaultBuiltInTopicIds={DEFAULT_CHART_TOPIC_IDS}
        catalogPath="worldbank-catalog.json"
        dashboard="worldbank"
        providerId="worldbank"
        onLoadDefaults={loadDefaultsFromFileAndAddCards}
        onClearDashboard={clearCards}
        onClose={() => setIsAdminOpen(false)}
      />
    );
  }

  return (
    <ProviderDashboardLayout
      basePath={basePath}
      currentProvider="worldbank"
      themeId={themeId}
      onThemeChange={setThemeId}
      headerExtra={
        <button
          type="button"
          onClick={() => setIsAdminOpen(true)}
          className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
        >
          Admin
        </button>
      }
      picker={
        <TopicPicker
          selectedTopicId={selectedTopicId}
          onSelectedTopicIdChange={setSelectedTopicId}
          onAddTopic={addCard}
          onAddTopicById={addCardForTopicId}
          onClear={clearCards}
          chartCount={cards.length}
          providerId="worldbank"
          topics={WORLD_BANK_TOPICS}
          catalogPath="worldbank-catalog.json"
          popularPath="popular-worldbank.json"
          badgeText="World Bank dashboard builder"
          titleText="World Bank indicators dashboard"
          descriptionText="Search World Bank indicator codes, add charts, and compare Estonia with aggregate or country peers."
        />
      }
      stats={[
        { label: 'Charts on dashboard', value: cards.length },
        { label: 'Available topics', value: WORLD_BANK_TOPICS.length },
        { label: 'Unique topics added', value: activeTopics.size },
        { label: 'Data source', value: 'World Bank' },
      ]}
      cards={cards}
      renderCard={(card) => (
        <ChartCard
          key={card.id}
          cardId={card.id}
          topicId={card.topicId}
          onRemove={removeCard}
          providerId="worldbank"
          providerName="World Bank"
          topicMap={WORLD_BANK_TOPIC_MAP}
          fetchTopicDataFn={fetchWorldBankTopicData}
          fetchAvailableGeosFn={fetchWorldBankAvailableGeosForTopic}
          defaultGeoValues={card.defaultGeoValues && card.defaultGeoValues.length > 0 ? card.defaultGeoValues : WORLD_BANK_DEFAULT_GEOS}
          fallbackDescriptionPrefix="World Bank indicator"
          sourceUrlBuilder={WORLD_BANK_SOURCE_URL_BUILDER}
          sourceLinkLabel="World Bank indicator"
          supportsForecast
        />
      )}
    />
  );
}
