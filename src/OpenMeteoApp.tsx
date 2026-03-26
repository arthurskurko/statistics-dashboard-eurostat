import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { ChartCard } from './components/ChartCard';
import { ProviderDashboardLayout } from './components/ProviderDashboardLayout';
import { TopicPicker } from './components/TopicPicker';
import { OPEN_METEO_TOPICS, OPEN_METEO_TOPIC_MAP } from './features/dashboard/openMeteoTopicCatalog';
import type { ThemeId } from './features/dashboard/themes';
import type { DashboardCard } from './features/dashboard/types';
import { useDefaultChartStorage } from './hooks/useDefaultChartStorage';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createDefaultChartsCandidateUrls, loadDefaultChartsFromCandidates } from './lib/defaultCharts';
import { fetchOpenMeteoTopicData, fetchAvailableGeosForTopic as fetchOpenMeteoAvailableGeosForTopic } from './lib/openMeteo';

const STORAGE_KEY = 'openmeteo-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'openmeteo-statistics-dashboard.defaultCharts';
const THEME_STORAGE_KEY = 'openmeteo-statistics-dashboard.theme';
const DEFAULT_CHART_TOPIC_IDS = ['meteo-temp-mean', 'meteo-temp-max', 'meteo-precip-sum'];
const OPEN_METEO_DEFAULT_GEOS = ['TLL', 'HEL'];
const OPEN_METEO_SOURCE_URL_BUILDER = () => 'https://open-meteo.com/en/docs';

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

export default function OpenMeteoApp() {
  const basePath = import.meta.env.BASE_URL;
  const backendBaseUrl =
    (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
    'http://localhost:8090';
  const [selectedTopicId, setSelectedTopicId] = useState<string>(OPEN_METEO_TOPICS[0].id);
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
    dashboard: 'openmeteo',
  });
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'mystic-forest');
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

  function normalizeTopicId(rawTopicId: string): string {
    if (rawTopicId in OPEN_METEO_TOPIC_MAP) {
      return rawTopicId;
    }

    const match = OPEN_METEO_TOPICS.find((topic) => topic.datasetCode === rawTopicId);
    if (match) {
      return match.id;
    }

    return rawTopicId;
  }

  const loadDefaultsFromFileAndAddCards = useCallback(async () => {
    const dashboard = 'openmeteo';
    const userId = 'anonymous';
    const candidates = createDefaultChartsCandidateUrls(basePath, dashboard, userId);

    const parsed = await loadDefaultChartsFromCandidates(candidates, dashboard);
    if (parsed) {
      const normalizedTopicIds = Array.from(new Set((parsed.topicIds ?? []).map(normalizeTopicId)));
      const mapped: Record<string, string[]> = {};

      if (parsed.chartDefaultsByTopicId && typeof parsed.chartDefaultsByTopicId === 'object') {
        for (const rawTopicId of parsed.topicIds ?? []) {
          const topicId = normalizeTopicId(rawTopicId);
          const tpl = parsed.chartDefaultsByTopicId[rawTopicId] ?? parsed.chartDefaultsByTopicId[topicId];

          if (Array.isArray(tpl)) {
            mapped[topicId] = tpl.filter((v: unknown): v is string => typeof v === 'string');
            continue;
          }

          const geo = (tpl as any)?.geoValues;
          mapped[topicId] = Array.isArray(geo)
            ? geo.filter((v: unknown): v is string => typeof v === 'string')
            : [];
        }
      }

      for (const topicId of normalizedTopicIds) {
        if (!(topicId in mapped)) {
          mapped[topicId] = [];
        }
      }

      setDefaultChartGeoValuesByTopicId(mapped);
      setDefaultTopicIds(normalizedTopicIds);
      setCards(normalizedTopicIds.map((topicId: string) => createCard(topicId, mapped[topicId])));
      return;
    }

    addDefaultCards();
  }, [addDefaultCards, basePath, normalizeTopicId, setCards, setDefaultChartGeoValuesByTopicId, setDefaultTopicIds]);

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
        topics={OPEN_METEO_TOPICS}
        topicMap={OPEN_METEO_TOPIC_MAP}
        defaultBuiltInTopicIds={DEFAULT_CHART_TOPIC_IDS}
        catalogPath="openmeteo-catalog.json"
        dashboard="openmeteo"
        providerId="openmeteo"
        onLoadDefaults={loadDefaultsFromFileAndAddCards}
        onClearDashboard={clearCards}
        onClose={() => setIsAdminOpen(false)}
      />
    );
  }

  return (
    <ProviderDashboardLayout
      basePath={basePath}
      currentProvider="openmeteo"
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
          providerId="openmeteo"
          topics={OPEN_METEO_TOPICS}
          catalogPath="openmeteo-catalog.json"
          popularPath="popular-openmeteo.json"
          badgeText="Open-Meteo dashboard builder"
          titleText="Open-Meteo climate dashboard"
          descriptionText="Track weather and climate variables across selected cities using the Open-Meteo archive API."
        />
      }
      stats={[
        { label: 'Charts on dashboard', value: cards.length },
        { label: 'Available topics', value: OPEN_METEO_TOPICS.length },
        { label: 'Unique topics added', value: activeTopics.size },
        { label: 'Data source', value: 'Open-Meteo' },
      ]}
      cards={cards}
      renderCard={(card) => (
        <ChartCard
          key={card.id}
          cardId={card.id}
          topicId={card.topicId}
          onRemove={removeCard}
          providerId="openmeteo"
          providerName="Open-Meteo"
          topicMap={OPEN_METEO_TOPIC_MAP}
          fetchTopicDataFn={fetchOpenMeteoTopicData}
          fetchAvailableGeosFn={fetchOpenMeteoAvailableGeosForTopic}
          defaultGeoValues={card.defaultGeoValues && card.defaultGeoValues.length > 0 ? card.defaultGeoValues : OPEN_METEO_DEFAULT_GEOS}
          fallbackDescriptionPrefix="Open-Meteo variable"
          sourceUrlBuilder={OPEN_METEO_SOURCE_URL_BUILDER}
          sourceLinkLabel="Open-Meteo docs"
          supportsForecast
          forecastOptions={[7, 14, 20, 30, 60, 90, 120, 180]}
          forecastUnitLabel="d"
        />
      )}
    />
  );
}
