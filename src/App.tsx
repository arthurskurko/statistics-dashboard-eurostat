import { useEffect, useMemo, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { ChartCard } from './components/ChartCard';
import { EmptyState } from './components/EmptyState';
import { StatChip } from './components/StatChip';
import { TopicPicker } from './components/TopicPicker';
import { TOPICS } from './features/dashboard/topicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useLocalStorage } from './hooks/useLocalStorage';

const STORAGE_KEY = 'estonia-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'estonia-statistics-dashboard.defaultCharts';
const THEME_STORAGE_KEY = 'estonia-statistics-dashboard.theme';

const DEFAULT_CHART_TOPIC_IDS = ['population', 'unemployment-rate', 'inflation'];

const THEMES = [
  { id: 'ember-noir', label: 'Ember Noir' },
  { id: 'batcave', label: 'Batcave Pixel' },
  { id: 'neon-grid', label: 'Neon Grid' },
  { id: 'aurora-core', label: 'Aurora Core' },
  { id: 'solar-flare', label: 'Solar Flare' },
  { id: 'mystic-forest', label: 'Mystic Forest' },
  { id: 'retro-console', label: 'Retro Console' },
] as const;

type ThemeId = (typeof THEMES)[number]['id'];

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
  const [defaultTopicIds, setDefaultTopicIds] = useLocalStorage<string[]>(
    DEFAULT_CHARTS_KEY,
    DEFAULT_CHART_TOPIC_IDS,
  );
  const [themeId, setThemeId] = useLocalStorage<ThemeId>(THEME_STORAGE_KEY, 'ember-noir');
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const activeTopics = useMemo(() => new Set(cards.map((card) => card.topicId)), [cards]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  useEffect(() => {
    // If the dashboard is empty, automatically load the user's default charts.
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

  function addDefaultCards() {
    setCards((currentCards) => {
      if (currentCards.length > 0) return currentCards;
      return [...defaultTopicIds.map((topicId) => createCard(topicId))];
    });
  }

  function removeCard(cardId: string) {
    setCards((currentCards) => currentCards.filter((card) => card.id !== cardId));
  }

  function clearCards() {
    setCards([]);
  }

  if (isAdminOpen) {
    return (
      <AdminPanel
        defaultTopicIds={defaultTopicIds}
        setDefaultTopicIds={setDefaultTopicIds}
        onLoadDefaults={addDefaultCards}
        onClearDashboard={clearCards}
        onClose={() => setIsAdminOpen(false)}
      />
    );
  }

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
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-2xl border border-white/20 bg-white/10 px-3 py-1 font-medium text-white">
              Eurostat
            </span>
            <a href="/worldbank" className="bat-btn rounded-2xl px-3 py-1 font-medium">
              World Bank
            </a>
          </div>
          <button
            type="button"
            onClick={() => setIsAdminOpen(true)}
            className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
          >
            Admin
          </button>
        </section>

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
