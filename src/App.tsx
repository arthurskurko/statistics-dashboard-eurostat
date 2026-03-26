import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { ChartCard } from './components/ChartCard';
import { ProviderDashboardLayout } from './components/ProviderDashboardLayout';
import { TopicPicker } from './components/TopicPicker';
import type { ThemeId } from './features/dashboard/themes';
import { TOPIC_MAP, TOPICS } from './features/dashboard/topicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useDefaultChartStorage } from './hooks/useDefaultChartStorage';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createDefaultChartsCandidateUrls, loadDefaultChartsFromCandidates } from './lib/defaultCharts';

const STORAGE_KEY = 'estonia-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'estonia-statistics-dashboard.defaultCharts';
const THEME_STORAGE_KEY = 'estonia-statistics-dashboard.theme';

const DEFAULT_CHART_TOPIC_IDS = ['population', 'unemployment-rate', 'inflation'];

function createCard(topicId: string, defaultGeoValues?: string[]): DashboardCard {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${topicId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    topicId,
    defaultGeoValues,
    createdAt: Date.now(),
  };
}

export default function App() {
  const basePath = import.meta.env.BASE_URL;
  const backendBaseUrl =
    (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
    'http://localhost:8090';
  const [selectedTopicId, setSelectedTopicId] = useState<string>(TOPICS[0].id);
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
    dashboard: 'eurostat',
  });
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'ember-noir');
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const activeTopics = useMemo(() => new Set(cards.map((card) => card.topicId)), [cards]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  useEffect(() => {
    // Seed defaults only for fresh browser caches without existing dashboard state.
    // Wait for backend status to settle so we use authoritative defaults when available.
    if (!shouldSeedDefaultsRef.current || cards.length > 0 || isCheckingBackend) {
      return;
    }

    if (defaultTopicIds.length === 0) {
      return;
    }

    setCards(defaultTopicIds.map((topicId: string) => createCard(topicId, defaultChartGeoValuesByTopicId[topicId])));
    shouldSeedDefaultsRef.current = false;
  }, [cards.length, defaultTopicIds, defaultChartGeoValuesByTopicId, isCheckingBackend, setCards]);

  function addCard() {
    setCards((currentCards) => [createCard(selectedTopicId, defaultChartGeoValuesByTopicId[selectedTopicId]), ...currentCards]);
  }

  function addCardForTopicId(topicId: string) {
    setCards((currentCards) => [createCard(topicId, defaultChartGeoValuesByTopicId[topicId]), ...currentCards]);
  }

  function addDefaultCards() {
    setCards((currentCards) => {
      if (currentCards.length > 0) return currentCards;
      return [...defaultTopicIds.map((topicId: string) => createCard(topicId, defaultChartGeoValuesByTopicId[topicId]))];
    });
  }

  async function loadDefaultsFromFileAndAddCards() {
    const dashboard = 'eurostat';
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
          mapped[topicId] = Array.isArray(geo) ? geo.filter((v: unknown): v is string => typeof v === 'string') : [];
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
    setCards((currentCards) => currentCards.filter((card) => card.id !== cardId));
  }, [setCards]);

  function clearCards() {
    setCards([]);
  }

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
        topics={TOPICS}
        topicMap={TOPIC_MAP}
        defaultBuiltInTopicIds={DEFAULT_CHART_TOPIC_IDS}
        catalogPath="catalog.json"
        dashboard="eurostat"
        providerId="eurostat"
        onLoadDefaults={loadDefaultsFromFileAndAddCards}
        onClearDashboard={clearCards}
        onClose={() => setIsAdminOpen(false)}
      />
    );
  }

  return (
    <ProviderDashboardLayout
      basePath={basePath}
      currentProvider="eurostat"
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
          providerId="eurostat"
          popularPath="popular-eurostat.json"
        />
      }
      stats={[
        { label: 'Charts on dashboard', value: cards.length },
        { label: 'Available topics', value: TOPICS.length },
        { label: 'Unique topics added', value: activeTopics.size },
        { label: 'Data source', value: 'Eurostat' },
      ]}
      cards={cards}
      renderCard={(card) => (
        <ChartCard
          key={card.id}
          cardId={card.id}
          topicId={card.topicId}
          onRemove={removeCard}
          defaultGeoValues={card.defaultGeoValues}
        />
      )}
    />
  );
}
