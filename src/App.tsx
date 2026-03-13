import { useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { EmptyState } from './components/EmptyState';
import { StatChip } from './components/StatChip';
import { TopicPicker } from './components/TopicPicker';
import { TOPICS } from './features/dashboard/topicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useLocalStorage } from './hooks/useLocalStorage';

const STORAGE_KEY = 'estonia-statistics-dashboard.cards';

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

export default function App() {
  const [selectedTopicId, setSelectedTopicId] = useState<string>(TOPICS[0].id);
  const [cards, setCards] = useLocalStorage<DashboardCard[]>(STORAGE_KEY, []);

  const activeTopics = useMemo(() => new Set(cards.map((card) => card.topicId)), [cards]);

  function addCard() {
    setCards((currentCards) => [...currentCards, createCard(selectedTopicId)]);
  }

  function addCardForTopicId(topicId: string) {
    setCards((currentCards) => [...currentCards, createCard(topicId)]);
  }

  function removeCard(cardId: string) {
    setCards((currentCards) => currentCards.filter((card) => card.id !== cardId));
  }

  function clearCards() {
    setCards([]);
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <TopicPicker
          selectedTopicId={selectedTopicId}
          onSelectedTopicIdChange={setSelectedTopicId}
          onAddTopic={addCard}
          onAddTopicById={addCardForTopicId}
          onClear={clearCards}
          chartCount={cards.length}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatChip label="Charts on dashboard" value={cards.length} />
          <StatChip label="Available topics" value={TOPICS.length} />
          <StatChip label="Unique topics added" value={activeTopics.size} />
          <StatChip label="Data source" value="Eurostat" />
        </section>

        {cards.length === 0 ? <EmptyState /> : null}

        {cards.length > 0 ? (
          <section className="grid gap-6 xl:grid-cols-2">
            {cards.map((card) => (
              <ChartCard key={card.id} cardId={card.id} topicId={card.topicId} onRemove={removeCard} />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
