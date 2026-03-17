import { useEffect, useMemo, useState } from 'react';
import { ChartCard } from './components/ChartCard';
import { EmptyState } from './components/EmptyState';
import { StatChip } from './components/StatChip';
import { TopicPicker } from './components/TopicPicker';
import { OPEN_METEO_TOPICS, OPEN_METEO_TOPIC_MAP } from './features/dashboard/openMeteoTopicCatalog';
import { THEMES, type ThemeId } from './features/dashboard/themes';
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
            <a href="/who" className="bat-btn rounded-2xl px-3 py-1 font-medium">
              WHO
            </a>
            <span className="rounded-2xl border border-white/20 bg-white/10 px-3 py-1 font-medium text-white">
              Open-Meteo
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
          topics={OPEN_METEO_TOPICS}
          catalogPath="openmeteo-catalog.json"
          badgeText="Open-Meteo dashboard builder"
          titleText="Open-Meteo climate dashboard"
          descriptionText="Track weather and climate variables across selected cities using the Open-Meteo archive API."
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatChip label="Charts on dashboard" value={cards.length} />
          <StatChip label="Available topics" value={OPEN_METEO_TOPICS.length} />
          <StatChip label="Unique topics added" value={activeTopics.size} />
          <StatChip label="Data source" value="Open-Meteo" />
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
                providerId="openmeteo"
                providerName="Open-Meteo"
                topicMap={OPEN_METEO_TOPIC_MAP}
                fetchTopicDataFn={fetchOpenMeteoTopicData}
                defaultGeoValues={OPEN_METEO_DEFAULT_GEOS}
                fallbackDescriptionPrefix="Open-Meteo variable"
                sourceUrlBuilder={OPEN_METEO_SOURCE_URL_BUILDER}
                sourceLinkLabel="Open-Meteo docs"
                supportsForecast
                forecastOptions={[7, 14, 30, 60]}
                forecastUnitLabel="d"
              />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
