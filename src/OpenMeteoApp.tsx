import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { ProviderDashboardLayout } from './components/ProviderDashboardLayout';
import { TopicPicker } from './components/TopicPicker';
import { OPEN_METEO_TOPICS, OPEN_METEO_TOPIC_MAP } from './features/dashboard/openMeteoTopicCatalog';
import type { ThemeId } from './features/dashboard/themes';
import type { DashboardCard } from './features/dashboard/types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { fetchOpenMeteoTopicData } from './lib/openMeteo';

const STORAGE_KEY = 'openmeteo-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'openmeteo-statistics-dashboard.defaultCharts';
const THEME_STORAGE_KEY = 'openmeteo-statistics-dashboard.theme';
const DEFAULT_CHART_TOPIC_IDS = ['meteo-temp-mean', 'meteo-temp-max', 'meteo-precip-sum'];
const OPEN_METEO_DEFAULT_GEOS = ['TLL', 'HEL'];
const OPEN_METEO_SOURCE_URL_BUILDER = () => 'https://open-meteo.com/en/docs';

function createCard(topicId: string): DashboardCard {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${topicId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    topicId,
    createdAt: Date.now(),
  };
}

export default function OpenMeteoApp() {
  const basePath = import.meta.env.BASE_URL;
  const [selectedTopicId, setSelectedTopicId] = useState<string>(OPEN_METEO_TOPICS[0].id);
  const [cards, setCards] = useLocalStorage<DashboardCard[]>(STORAGE_KEY, []);
  const [defaultTopicIds] = useLocalStorage<string[]>(DEFAULT_CHARTS_KEY, DEFAULT_CHART_TOPIC_IDS);
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'mystic-forest');

  const activeTopics = useMemo(() => new Set(cards.map((card) => card.topicId)), [cards]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  useEffect(() => {
    if (cards.length === 0 && defaultTopicIds.length > 0) {
      setCards(defaultTopicIds.map((topicId) => createCard(topicId)));
    }
  }, [cards.length, defaultTopicIds, setCards]);

  function addCard() {
    setCards((currentCards) => [createCard(selectedTopicId), ...currentCards]);
  }

  function addCardForTopicId(topicId: string) {
    setCards((currentCards) => [createCard(topicId), ...currentCards]);
  }

  function clearCards() {
    setCards([]);
  }

  const removeCard = useCallback((cardId: string) => {
    setCards((currentCards) => currentCards.filter((entry) => entry.id !== cardId));
  }, [setCards]);

  return (
    <ProviderDashboardLayout
      basePath={basePath}
      currentProvider="openmeteo"
      themeId={themeId}
      onThemeChange={setThemeId}
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
          defaultGeoValues={OPEN_METEO_DEFAULT_GEOS}
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
