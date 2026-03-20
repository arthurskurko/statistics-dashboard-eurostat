import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { ProviderDashboardLayout } from './components/ProviderDashboardLayout';
import { TopicPicker } from './components/TopicPicker';
import type { ThemeId } from './features/dashboard/themes';
import { WORLD_BANK_TOPICS, WORLD_BANK_TOPIC_MAP } from './features/dashboard/worldBankTopicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { fetchWorldBankTopicData } from './lib/worldBank';

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

export default function WorldBankApp() {
  const basePath = import.meta.env.BASE_URL;
  const [selectedTopicId, setSelectedTopicId] = useState<string>(WORLD_BANK_TOPICS[0].id);
  const [cards, setCards] = useLocalStorage<DashboardCard[]>(STORAGE_KEY, []);
  const [defaultTopicIds] = useLocalStorage<string[]>(DEFAULT_CHARTS_KEY, DEFAULT_CHART_TOPIC_IDS);
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'neon-grid');

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
      currentProvider="worldbank"
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
          defaultGeoValues={WORLD_BANK_DEFAULT_GEOS}
          fallbackDescriptionPrefix="World Bank indicator"
          sourceUrlBuilder={WORLD_BANK_SOURCE_URL_BUILDER}
          sourceLinkLabel="World Bank indicator"
          supportsForecast
        />
      )}
    />
  );
}
