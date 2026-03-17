import { useEffect, useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { EmptyState } from './components/EmptyState';
import { StatChip } from './components/StatChip';
import { TopicPicker } from './components/TopicPicker';
import { WORLD_BANK_TOPICS, WORLD_BANK_TOPIC_MAP } from './features/dashboard/worldBankTopicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { fetchWorldBankTopicData } from './lib/worldBank';

const STORAGE_KEY = 'worldbank-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'worldbank-statistics-dashboard.defaultCharts';
const DEFAULT_CHART_TOPIC_IDS = ['wb-pop-total', 'wb-unemployment', 'wb-inflation'];
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
  const [selectedTopicId, setSelectedTopicId] = useState<string>(WORLD_BANK_TOPICS[0].id);
  const [cards, setCards] = useLocalStorage<DashboardCard[]>(STORAGE_KEY, []);
  const [defaultTopicIds] = useLocalStorage<string[]>(DEFAULT_CHARTS_KEY, DEFAULT_CHART_TOPIC_IDS);

  const activeTopics = useMemo(() => new Set(cards.map((card) => card.topicId)), [cards]);

  useEffect(() => {
    if (cards.length === 0 && defaultTopicIds.length > 0) {
      setCards(defaultTopicIds.map((topicId) => createCard(topicId)));
    }
  }, [cards.length, defaultTopicIds, setCards]);

  function addCard() {
    setCards((currentCards) => [...currentCards, createCard(selectedTopicId)]);
  }

  function addCardForTopicId(topicId: string) {
    setCards((currentCards) => [...currentCards, createCard(topicId)]);
  }

  function clearCards() {
    setCards([]);
  }

  return (
    <div className="batcave-page min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="batcave-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-300">Provider pages</div>
          <div className="flex items-center gap-2 text-xs">
            <a href="/" className="bat-btn rounded-2xl px-3 py-1 font-medium">
              Eurostat
            </a>
            <span className="rounded-2xl border border-white/20 bg-white/10 px-3 py-1 font-medium text-white">
              World Bank
            </span>
          </div>
        </section>

        <TopicPicker
          selectedTopicId={selectedTopicId}
          onSelectedTopicIdChange={setSelectedTopicId}
          onAddTopic={addCard}
          onAddTopicById={addCardForTopicId}
          onClear={clearCards}
          chartCount={cards.length}
          topics={WORLD_BANK_TOPICS}
          catalogPath="worldbank-catalog.json"
          badgeText="World Bank dashboard builder"
          titleText="World Bank indicators dashboard"
          descriptionText="Search World Bank indicator codes, add charts, and compare Estonia with aggregate or country peers."
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatChip label="Charts on dashboard" value={cards.length} />
          <StatChip label="Available topics" value={WORLD_BANK_TOPICS.length} />
          <StatChip label="Unique topics added" value={activeTopics.size} />
          <StatChip label="Data source" value="World Bank" />
        </section>

        {cards.length === 0 ? <EmptyState /> : null}

        {cards.length > 0 ? (
          <section className="grid gap-6 xl:grid-cols-2">
            {cards.map((card) => (
              <ChartCard
                key={card.id}
                cardId={card.id}
                topicId={card.topicId}
                onRemove={(cardId) => setCards((currentCards) => currentCards.filter((entry) => entry.id !== cardId))}
                providerId="worldbank"
                providerName="World Bank"
                topicMap={WORLD_BANK_TOPIC_MAP}
                fetchTopicDataFn={fetchWorldBankTopicData}
                defaultGeoValues={WORLD_BANK_DEFAULT_GEOS}
                fallbackDescriptionPrefix="World Bank indicator"
                sourceUrlBuilder={WORLD_BANK_SOURCE_URL_BUILDER}
                sourceLinkLabel="World Bank indicator"
                supportsForecast={false}
              />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
