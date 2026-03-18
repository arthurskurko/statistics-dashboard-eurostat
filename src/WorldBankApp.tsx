import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { EmptyState } from './components/EmptyState';
import { StatChip } from './components/StatChip';
import { TopicPicker } from './components/TopicPicker';
import { THEMES, type ThemeId } from './features/dashboard/themes';
import { WORLD_BANK_TOPICS, WORLD_BANK_TOPIC_MAP } from './features/dashboard/worldBankTopicCatalog';
import type { DashboardCard } from './features/dashboard/types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { fetchWorldBankTopicData } from './lib/worldBank';

const STORAGE_KEY = 'worldbank-statistics-dashboard.cards';
const DEFAULT_CHARTS_KEY = 'worldbank-statistics-dashboard.defaultCharts';
const THEME_STORAGE_KEY = 'worldbank-statistics-dashboard.theme';
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
            <a href={basePath} className="bat-btn rounded-2xl px-3 py-1 font-medium">
              Eurostat
            </a>
            <a href={`${basePath}dashboard`} className="bat-btn rounded-2xl px-3 py-1 font-medium">
              Unified
            </a>
            <span className="rounded-2xl border border-white/20 bg-white/10 px-3 py-1 font-medium text-white">
              World Bank
            </span>
            <a href={`${basePath}who`} className="bat-btn rounded-2xl px-3 py-1 font-medium">
              WHO
            </a>
            <a href={`${basePath}meteo`} className="bat-btn rounded-2xl px-3 py-1 font-medium">
              Open-Meteo
            </a>
          </div>
        </section>

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
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
