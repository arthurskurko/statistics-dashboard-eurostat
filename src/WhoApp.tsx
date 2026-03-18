import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { ProviderDashboardLayout } from './components/ProviderDashboardLayout';
import { TopicPicker } from './components/TopicPicker';
import type { ThemeId } from './features/dashboard/themes';
import { WHO_TOPICS, WHO_TOPIC_MAP } from './features/dashboard/whoTopicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { fetchWhoTopicData } from './lib/who';

const STORAGE_KEY = 'who-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'who-statistics-dashboard.defaultCharts';
const THEME_STORAGE_KEY = 'who-statistics-dashboard.theme';
const DEFAULT_CHART_TOPIC_IDS = ['who-life-expectancy', 'who-obesity-adult', 'who-diabetes-age-std'];
const WHO_DEFAULT_GEOS = ['EST', 'EUR'];
const WHO_SOURCE_URL_BUILDER = (datasetCode: string) => `https://ghoapi.azureedge.net/api/${datasetCode}`;

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

export default function WhoApp() {
  const basePath = import.meta.env.BASE_URL;
  const [selectedTopicId, setSelectedTopicId] = useState<string>(WHO_TOPICS[0].id);
  const [cards, setCards] = useLocalStorage<DashboardCard[]>(STORAGE_KEY, []);
  const [defaultTopicIds] = useLocalStorage<string[]>(DEFAULT_CHARTS_KEY, DEFAULT_CHART_TOPIC_IDS);
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'aurora-core');

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
      currentProvider="who"
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
          providerId="who"
          topics={WHO_TOPICS}
          catalogPath="popular-who.json"
          popularPath="popular-who.json"
          badgeText="WHO dashboard builder"
          titleText="WHO indicators dashboard"
          descriptionText="WHO data in this deployment is served from offline snapshots generated during build time. Search WHO GHO OData indicator codes and compare Estonia with Europe or other selected geographies."
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
          defaultGeoValues={WHO_DEFAULT_GEOS}
          fallbackDescriptionPrefix="WHO indicator"
          sourceUrlBuilder={WHO_SOURCE_URL_BUILDER}
          sourceLinkLabel="WHO indicator"
          supportsForecast
        />
      )}
    />
  );
}
