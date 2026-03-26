import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { ChartCard } from './components/ChartCard';
import { ProviderDashboardLayout } from './components/ProviderDashboardLayout';
import { TopicPicker } from './components/TopicPicker';
import type { ThemeId } from './features/dashboard/themes';
import { WHO_TOPICS, WHO_TOPIC_MAP } from './features/dashboard/whoTopicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useDefaultChartStorage } from './hooks/useDefaultChartStorage';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createDefaultChartsCandidateUrls, loadDefaultChartsFromCandidates } from './lib/defaultCharts';
import { fetchWhoTopicData, fetchAvailableGeosForTopic as fetchWhoAvailableGeosForTopic } from './lib/who';

const STORAGE_KEY = 'who-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'who-statistics-dashboard.defaultCharts';
const THEME_STORAGE_KEY = 'who-statistics-dashboard.theme';
const DEFAULT_CHART_TOPIC_IDS = ['who-life-expectancy', 'who-obesity-adult', 'who-diabetes-age-std'];
const WHO_DEFAULT_GEOS = ['EST', 'EUR'];
const WHO_SOURCE_URL_BUILDER = (datasetCode: string) => `https://ghoapi.azureedge.net/api/${datasetCode}`;

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

export default function WhoApp() {
  const basePath = import.meta.env.BASE_URL;
  const backendBaseUrl =
    (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
    'http://localhost:8090';
  const [selectedTopicId, setSelectedTopicId] = useState<string>(WHO_TOPICS[0].id);
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
    dashboard: 'who',
  });
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'aurora-core');
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const activeTopics = useMemo(() => new Set(cards.map((card) => card.topicId)), [cards]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  useEffect(() => {
    if (shouldSeedDefaultsRef.current && cards.length === 0 && defaultTopicIds.length > 0) {
      setCards(defaultTopicIds.map((topicId) => createCard(topicId, defaultChartGeoValuesByTopicId[topicId])));
      shouldSeedDefaultsRef.current = false;
    }
  }, [cards.length, defaultTopicIds, defaultChartGeoValuesByTopicId, setCards]);

  function addCard() {
    setCards((currentCards) => [createCard(selectedTopicId, defaultChartGeoValuesByTopicId[selectedTopicId]), ...currentCards]);
  }

  function addCardForTopicId(topicId: string) {
    setCards((currentCards) => [createCard(topicId, defaultChartGeoValuesByTopicId[topicId]), ...currentCards]);
  }

  function clearCards() {
    setCards([]);
  }

  function addDefaultCards() {
    setCards((currentCards) => {
      if (currentCards.length > 0) return currentCards;
      return [...defaultTopicIds.map((topicId) => createCard(topicId, defaultChartGeoValuesByTopicId[topicId]))];
    });
  }

  async function loadDefaultsFromFileAndAddCards() {
    const dashboard = 'who';
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
  }

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
        topics={WHO_TOPICS}
        topicMap={WHO_TOPIC_MAP}
        defaultBuiltInTopicIds={DEFAULT_CHART_TOPIC_IDS}
        catalogPath="who-catalog.json"
        dashboard="who"
        providerId="who"
        onLoadDefaults={loadDefaultsFromFileAndAddCards}
        onClearDashboard={clearCards}
        onClose={() => setIsAdminOpen(false)}
      />
    );
  }

  return (
    <ProviderDashboardLayout
      basePath={basePath}
      currentProvider="who"
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
          providerId="who"
          topics={WHO_TOPICS}
          catalogPath="who-catalog.json"
          popularPath="popular-who.json"
          badgeText="WHO dashboard builder"
          titleText="WHO indicators dashboard"
          descriptionText="Search the full WHO indicator catalog and compare Estonia with Europe or other selected geographies. Local development uses live WHO API requests via proxy; deployments can use pre-generated snapshots."
        />
      }
      stats={[
        { label: 'Charts on dashboard', value: cards.length },
        { label: 'Available topics', value: WHO_TOPICS.length },
        { label: 'Unique topics added', value: activeTopics.size },
        { label: 'Data source', value: 'WHO GHO OData' },
      ]}
      cards={cards}
      renderCard={(card) => (
        <ChartCard
          key={card.id}
          cardId={card.id}
          topicId={card.topicId}
          onRemove={removeCard}
          providerId="who"
          providerName="WHO"
          topicMap={WHO_TOPIC_MAP}
          fetchTopicDataFn={fetchWhoTopicData}
          fetchAvailableGeosFn={fetchWhoAvailableGeosForTopic}
          defaultGeoValues={card.defaultGeoValues && card.defaultGeoValues.length > 0 ? card.defaultGeoValues : WHO_DEFAULT_GEOS}
          fallbackDescriptionPrefix="WHO indicator"
          sourceUrlBuilder={WHO_SOURCE_URL_BUILDER}
          sourceLinkLabel="WHO indicator"
          supportsForecast
        />
      )}
    />
  );
}
