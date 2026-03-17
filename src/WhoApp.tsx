import { useEffect, useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { EmptyState } from './components/EmptyState';
import { StatChip } from './components/StatChip';
import { TopicPicker } from './components/TopicPicker';
import { THEMES, type ThemeId } from './features/dashboard/themes';
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
            <a href="/" className="bat-btn rounded-2xl px-3 py-1 font-medium">
              Eurostat
            </a>
            <a href="/worldbank" className="bat-btn rounded-2xl px-3 py-1 font-medium">
              World Bank
            </a>
            <span className="rounded-2xl border border-white/20 bg-white/10 px-3 py-1 font-medium text-white">
              WHO
            </span>
            <a href="/meteo" className="bat-btn rounded-2xl px-3 py-1 font-medium">
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
          providerId="who"
          topics={WHO_TOPICS}
          catalogPath="who-catalog.json"
          popularPath="popular-who.json"
          badgeText="WHO dashboard builder"
          titleText="WHO indicators dashboard"
          descriptionText="Search WHO GHO OData indicator codes and compare Estonia with Europe or other selected geographies."
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatChip label="Charts on dashboard" value={cards.length} />
          <StatChip label="Available topics" value={WHO_TOPICS.length} />
          <StatChip label="Unique topics added" value={activeTopics.size} />
          <StatChip label="Data source" value="WHO GHO OData" />
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
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
