import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { TOPIC_MAP } from '../features/dashboard/topicCatalog';
import type { TopicData, TopicDefinition } from '../features/dashboard/types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { fetchTopicData as fetchEurostatTopicData, fetchAvailableGeosForTopic as fetchEurostatAvailableGeosForTopic } from '../lib/eurostat';
import { getRenderSafetyLimits } from '../lib/renderSafety';
import { buildChartOption } from './chart-card/buildChartOption';
import { ChartCardToolbar } from './chart-card/ChartCardToolbar';
import { ChartCardHeader } from './chart-card/ChartCardHeader';
import { computeLatestValues, findDimensionValueLabel, type DimensionOption } from './chart-card/helpers';
import { LatestValuesGrid } from './chart-card/LatestValuesGrid';
import { MusicSettingsModal } from './chart-card/MusicSettingsModal';
import { useChartMusic, type MusicVisualStepInfo } from './chart-card/useChartMusic';
import { useCompactMobileLayout } from './chart-card/useCompactMobileLayout';

type ChartCardProps = {
  cardId: string;
  topicId: string;
  onRemove: (cardId: string) => void;
  providerId?: string;
  providerName?: string;
  topicMap?: Record<string, TopicDefinition>;
  fetchTopicDataFn?: (
    topicId: string,
    options?: {
      forecastHorizon?: number;
      filters?: Record<string, string | string[]>;
      seriesDimension?: string;
      geoValues?: string[];
    },
  ) => Promise<TopicData>;
  fetchAvailableGeosFn?: (
    topicId: string,
    filters?: Record<string, string | string[]>,
  ) => Promise<Array<{ code: string; label: string }>>;
  defaultGeoValues?: string[];
  fallbackDescriptionPrefix?: string;
  sourceUrlBuilder?: (datasetCode: string) => string;
  sourceLinkLabel?: string;
  supportsForecast?: boolean;
  forecastOptions?: number[];
  forecastUnitLabel?: string;
};

const MAX_SERIES_TO_RENDER = 16;
const DEFAULT_EUROSTAT_GEOS = ['EE', 'EU27_2020'];
const DEFAULT_EUROSTAT_SOURCE_URL_BUILDER = (datasetCode: string) =>
  `https://ec.europa.eu/eurostat/databrowser/view/${datasetCode}/default/table?lang=en`;

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function ChartCardComponent({
  cardId,
  topicId,
  onRemove,
  providerId = 'eurostat',
  providerName = 'Eurostat',
  topicMap = TOPIC_MAP,
  fetchTopicDataFn = fetchEurostatTopicData,
  fetchAvailableGeosFn = fetchEurostatAvailableGeosForTopic,
  defaultGeoValues,
  fallbackDescriptionPrefix = 'Eurostat dataset',
  sourceUrlBuilder = DEFAULT_EUROSTAT_SOURCE_URL_BUILDER,
  sourceLinkLabel = 'Eurostat dataset',
  supportsForecast = true,
  forecastOptions = [5, 10, 20, 30],
  forecastUnitLabel = 'y',
}: ChartCardProps) {
  const topic = useMemo<TopicDefinition>(
    () =>
      topicMap[topicId] ?? {
        id: topicId,
        title: topicId,
        description: `${fallbackDescriptionPrefix} ${topicId}`,
        datasetCode: topicId,
        filters: {},
        geoValues: defaultGeoValues,
        decimals: 0,
        sourceUrl: sourceUrlBuilder(topicId),
        pubmed: {
          availability: 'unchecked',
          searchTerm: undefined,
          note: 'This topic was added dynamically and has no curated PubMed mapping yet.',
        },
      },
    [defaultGeoValues, fallbackDescriptionPrefix, sourceUrlBuilder, topicId, topicMap],
  );

  const [forecastHorizon, setForecastHorizon] = useLocalStorage<number>(`${providerId}.forecastHorizon`, 20);
  const [dimensionFilters, setDimensionFilters] = React.useState<Record<string, string | string[]>>({});
  const [availableDimensions, setAvailableDimensions] = React.useState<DimensionOption[]>([]);
  const [seriesDimension, setSeriesDimension] = React.useState('');
  const initialGeoValues = topic.geoValues ?? defaultGeoValues ?? DEFAULT_EUROSTAT_GEOS;
  const [geoValues, setGeoValues] = React.useState<string[]>(initialGeoValues);
  const [dualAxis, setDualAxis] = React.useState(true);
  const [periodStart, setPeriodStart] = React.useState('');
  const [periodEnd, setPeriodEnd] = React.useState('');
  const [chartInViewport, setChartInViewport] = React.useState(true);

  const [availableGeoCandidates, setAvailableGeoCandidates] = React.useState<Array<{ code: string; label: string }>>([]);
  const [isLoadingAvailableGeos, setIsLoadingAvailableGeos] = React.useState(false);
  const cardRef = React.useRef<HTMLElement | null>(null);
  const chartRef = React.useRef<ReactECharts | null>(null);
  const previousStepPointBySeriesRef = React.useRef(new Map<string, { label: string; value: number; color: string }>());
  const latestMusicStepRef = React.useRef<MusicVisualStepInfo | null>(null);
  const previousLatestObservedPeriodRef = React.useRef('');
  const compactMobileLayout = useCompactMobileLayout(chartRef);

  const resolvedDefaultGeos = useMemo(() => {
    if (Array.isArray(defaultGeoValues) && defaultGeoValues.length > 0) return defaultGeoValues;
    if (Array.isArray(topic.geoValues) && topic.geoValues.length > 0) return topic.geoValues;
    return DEFAULT_EUROSTAT_GEOS;
  }, [defaultGeoValues, topic.geoValues]);

  React.useEffect(() => {
    setDimensionFilters({});
    setAvailableDimensions([]);
    setSeriesDimension('');
    setGeoValues((current) =>
      areStringArraysEqual(current, resolvedDefaultGeos) ? current : resolvedDefaultGeos,
    );
  }, [resolvedDefaultGeos, topicId]);

  React.useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first) return;
        setChartInViewport(first.isIntersecting);
      },
      { root: null, rootMargin: '140px 0px', threshold: 0 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (seriesDimension !== 'unit') return;

    const unitDim = availableDimensions.find((dim) => dim.id === 'unit');
    if (!unitDim) return;

    const existing = dimensionFilters.unit;
    const hasSelection = Array.isArray(existing) ? existing.length > 0 : Boolean(existing);
    if (hasSelection) return;

    const defaultUnits = unitDim.values.slice(0, MAX_UNIT_SELECTIONS).map((u) => u.code);
    setDimensionFilters((prev) => ({
      ...prev,
      unit: defaultUnits,
    }));
  }, [seriesDimension, availableDimensions, dimensionFilters.unit]);

  const MAX_UNIT_SELECTIONS = 3;

  const selectedUnits = React.useMemo(() => {
    const value = dimensionFilters.unit;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value) return [value];
    return [];
  }, [dimensionFilters.unit]);

  const unitSelectionTooLarge = seriesDimension === 'unit' && selectedUnits.length > MAX_UNIT_SELECTIONS;
  const needsUnitSelection = seriesDimension === 'unit' && selectedUnits.length === 0;

  const query = useQuery({
    queryKey: [providerId, 'topic-data', topicId, forecastHorizon, dimensionFilters, seriesDimension, geoValues],
    enabled: !needsUnitSelection && !unitSelectionTooLarge,
    queryFn: () => {
      const activeFilters = Object.fromEntries(
        Object.entries(dimensionFilters).filter(([key, value]) => {
          if (seriesDimension === 'unit' && key === 'unit') {
            // When splitting by unit we still want to respect the selected units.
            return Array.isArray(value) ? value.length > 0 : Boolean(value);
          }
          return key !== seriesDimension;
        }),
      );

      return fetchTopicDataFn(topicId, {
        forecastHorizon: supportsForecast ? forecastHorizon : undefined,
        filters: activeFilters,
        seriesDimension,
        geoValues,
      });
    },
  });

  const effectiveSeries = useMemo(
    () => query.data?.series.slice(0, MAX_SERIES_TO_RENDER) ?? [],
    [query.data],
  );

  const allPeriods = useMemo(() => query.data?.periods ?? [], [query.data]);
  const selectablePeriods = useMemo(() => {
    const observedPoints = new Set(
      effectiveSeries
        .filter((series) => !series.label.includes('(forecast)'))
        .flatMap((series) => series.points.map((point) => point.label)),
    );

    const observedPeriods = allPeriods.filter((period) => observedPoints.has(period));
    return observedPeriods.length > 0 ? observedPeriods : allPeriods;
  }, [allPeriods, effectiveSeries]);

  React.useEffect(() => {
    if (selectablePeriods.length === 0) {
      setPeriodStart('');
      setPeriodEnd('');
      return;
    }

    setPeriodStart((current) => (selectablePeriods.includes(current) ? current : selectablePeriods[0]));
    setPeriodEnd((current) =>
      selectablePeriods.includes(current) ? current : selectablePeriods[selectablePeriods.length - 1],
    );
  }, [selectablePeriods]);

  const periodStartIndex = periodStart ? allPeriods.indexOf(periodStart) : 0;
  const periodEndIndex = periodEnd ? allPeriods.indexOf(periodEnd) : allPeriods.length - 1;
  const rangeStartIndex = Math.max(0, Math.min(periodStartIndex, periodEndIndex));
  const rangeEndIndex = Math.max(periodStartIndex, periodEndIndex);
  const latestObservedPeriod = selectablePeriods.at(-1) ?? '';

  React.useEffect(() => {
    const previousLatest = previousLatestObservedPeriodRef.current;

    if (!supportsForecast) {
      previousLatestObservedPeriodRef.current = latestObservedPeriod;
      return;
    }

    if (!latestObservedPeriod) {
      previousLatestObservedPeriodRef.current = '';
      return;
    }

    // Preserve user intent when they keep "end" at the latest observed period.
    // If latest shifts due geo/filter changes, move end with it so forecast remains visible.
    setPeriodEnd((current) => {
      if (!current) return latestObservedPeriod;
      if (previousLatest && current === previousLatest && latestObservedPeriod !== previousLatest) {
        return latestObservedPeriod;
      }
      return current;
    });

    previousLatestObservedPeriodRef.current = latestObservedPeriod;
  }, [latestObservedPeriod, supportsForecast]);

  const includeForecastTail = supportsForecast && periodEnd === latestObservedPeriod;

  const filteredPeriods = useMemo(() => {
    if (allPeriods.length === 0) return [];
    if (includeForecastTail) {
      return allPeriods.slice(rangeStartIndex);
    }
    return allPeriods.slice(rangeStartIndex, rangeEndIndex + 1);
  }, [allPeriods, includeForecastTail, rangeEndIndex, rangeStartIndex]);

  const filteredPeriodSet = useMemo(() => new Set(filteredPeriods), [filteredPeriods]);

  const filteredSeries = useMemo(
    () =>
      effectiveSeries
        .map((series) => ({
          ...series,
          points: series.points.filter((point) => filteredPeriodSet.has(point.label)),
        }))
        .filter((series) => series.points.length > 0),
    [effectiveSeries, filteredPeriodSet],
  );

  const filteredTopicData = useMemo(
    () =>
      query.data
        ? {
            ...query.data,
            periods: filteredPeriods,
            series: filteredSeries,
          }
        : undefined,
    [filteredPeriods, filteredSeries, query.data],
  );

  const renderSafetyWarning = useMemo(() => {
    if (!filteredTopicData) return null;

    const renderLimits = getRenderSafetyLimits(providerId);

    const seriesCount = filteredTopicData.series.length;
    const periodCount = filteredTopicData.periods.length;
    const totalPoints = filteredTopicData.series.reduce((sum, entry) => sum + entry.points.length, 0);
    const renderCells = seriesCount * periodCount;

    if (
      periodCount > renderLimits.maxPeriods ||
      totalPoints > renderLimits.maxTotalPoints ||
      renderCells > renderLimits.maxRenderCells
    ) {
      return (
        `Dataset too large to render safely (series: ${seriesCount}, periods: ${periodCount}, points: ${totalPoints}, cells: ${renderCells}). ` +
        'Reduce geographies or apply stricter filters before charting.'
      );
    }

    if (seriesCount > MAX_SERIES_TO_RENDER) {
      return (
        `Dataset includes ${seriesCount} series, which exceeds the safe chart limit of ${MAX_SERIES_TO_RENDER}. ` +
        'Apply filters or choose fewer geographies.'
      );
    }

    return null;
  }, [filteredTopicData, providerId]);

  const baseSeries = useMemo(
    () => filteredSeries.filter((series) => !series.label.includes('(forecast)')),
    [filteredSeries],
  );

  const { largeSeries, showDualAxisButton } = useMemo(() => {
    const seriesMax = baseSeries.map((series) => ({
      label: series.label,
      max: Math.max(...series.points.map((point) => point.value), 0),
    }));
    const overallMax = Math.max(...seriesMax.map((series) => series.max), 0);
    const largeThreshold = overallMax * 0.25;
    const nextLargeSeries = seriesMax
      .filter((series) => series.max >= largeThreshold)
      .map((series) => series.label);
    const smallSeries = seriesMax
      .filter((series) => series.max < largeThreshold)
      .map((series) => series.label);

    return {
      largeSeries: nextLargeSeries,
      showDualAxisButton: nextLargeSeries.length > 0 && smallSeries.length > 0,
    };
  }, [baseSeries]);

  React.useEffect(() => {
    if (!query.data?.extraDimensions) return;

    if (availableDimensions.length === 0) {
      setAvailableDimensions(query.data.extraDimensions);
    }

    if (
      Object.keys(dimensionFilters).length > 0 &&
      !query.data.extraDimensions.some((dimension) => Object.keys(dimensionFilters).includes(dimension.id))
    ) {
      setDimensionFilters({});
    }
  }, [query.data, availableDimensions.length, dimensionFilters]);

  const missingGeos = useMemo(() => {
    if (!query.data) return [];
    const responseGeoCodes = new Set(query.data.availableGeos?.map((geo) => geo.code));
    return geoValues.filter((geo) => !responseGeoCodes.has(geo));
  }, [geoValues, query.data]);

  const fetchAndApplyAvailableGeos = React.useCallback(async () => {
    setIsLoadingAvailableGeos(true);
    try {
      const activeFilters = Object.fromEntries(
        Object.entries(dimensionFilters).filter(([key, value]) => {
          if (seriesDimension === 'unit' && key === 'unit') {
            return Array.isArray(value) ? value.length > 0 : Boolean(value);
          }
          return key !== seriesDimension;
        }),
      );

      const geos = await fetchAvailableGeosFn(topicId, activeFilters);
      setAvailableGeoCandidates(geos);
    } catch (error) {
      console.warn('Error fetching available geos:', error);
    } finally {
      setIsLoadingAvailableGeos(false);
    }
  }, [topicId, dimensionFilters, seriesDimension]);

  const activeFilterLabels = useMemo(() => {
    if (!query.data) return [];
    return Object.entries(dimensionFilters)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) =>
        findDimensionValueLabel(
          availableDimensions,
          key,
          Array.isArray(value) ? value : value,
        ),
      );
  }, [availableDimensions, dimensionFilters, query.data]);

  const applyMusicStepHighlights = React.useCallback((stepInfo: MusicVisualStepInfo | null) => {
    latestMusicStepRef.current = stepInfo;
    if (!chartInViewport) return;
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const previousHighlights = previousStepPointBySeriesRef.current;
    const nextHighlights = new Map<string, { label: string; value: number; color: string }>();
    stepInfo?.points.forEach((point) => {
      nextHighlights.set(point.seriesLabel, {
        label: point.label,
        value: point.value,
        color: point.color,
      });
    });

    const changedSeriesLabels = new Set<string>();
    previousHighlights.forEach((previousPoint, seriesLabel) => {
      const nextPoint = nextHighlights.get(seriesLabel);
      if (!nextPoint) {
        changedSeriesLabels.add(seriesLabel);
        return;
      }
      if (
        nextPoint.label !== previousPoint.label
        || nextPoint.value !== previousPoint.value
        || nextPoint.color !== previousPoint.color
      ) {
        changedSeriesLabels.add(seriesLabel);
      }
    });
    nextHighlights.forEach((_, seriesLabel) => {
      if (!previousHighlights.has(seriesLabel)) {
        changedSeriesLabels.add(seriesLabel);
      }
    });

    if (changedSeriesLabels.size === 0) {
      return;
    }

    const symbolSize = compactMobileLayout ? 10 : 12;
    const seriesPatch = Array.from(changedSeriesLabels).map((seriesLabel) => {
      const highlight = nextHighlights.get(seriesLabel);
      return {
        id: `series-${seriesLabel}`,
        markPoint: highlight
          ? {
              data: [
                {
                  coord: [highlight.label, highlight.value],
                  symbol: 'circle',
                  symbolSize,
                  itemStyle: {
                    color: '#ffffff',
                    borderColor: highlight.color,
                    borderWidth: 2,
                  },
                },
              ],
            }
          : { data: [] },
      };
    });

    previousStepPointBySeriesRef.current = nextHighlights;

    chart.setOption(
      { series: seriesPatch } as EChartsOption,
      { lazyUpdate: true, silent: true },
    );
  }, [chartInViewport, compactMobileLayout]);

  const {
    musicPlaying,
    musicModalOpen,
    setMusicModalOpen,
    musicTempo,
    setMusicTempo,
    globalTempoSyncEnabled,
    setGlobalTempoSyncEnabled,
    musicPlaybackMode,
    setMusicPlaybackMode,
    musicScale,
    setMusicScale,
    musicOctaveShift,
    setMusicOctaveShift,
    musicInstrument,
    setMusicInstrument,
    musicArpeggiate,
    setMusicArpeggiate,
    musicSwing,
    setMusicSwing,
    musicDelayTime,
    setMusicDelayTime,
    musicDelayFeedback,
    setMusicDelayFeedback,
    musicReverbWet,
    setMusicReverbWet,
    musicReverbDecay,
    setMusicReverbDecay,
    musicVolume,
    setMusicVolume,
    musicPhaseOffset,
    setMusicPhaseOffset,
    globalRecording,
    globalRecordingBusy,
    globalRecordingSupported,
    handleGlobalRecording,
    toggleMusicPlayback,
  } = useChartMusic({
    cardId,
    providerId,
    filteredSeries,
    visualUpdatesEnabled: chartInViewport,
    onVisualStep: applyMusicStepHighlights,
  });

  const chartBuild = useMemo(() => {
    if (!filteredTopicData || filteredTopicData.series.length === 0 || renderSafetyWarning) {
      return { option: undefined, error: null as string | null };
    }

    try {
      return {
        option: buildChartOption({
          topic,
            data: filteredTopicData,
            effectiveSeries: filteredSeries,
          baseSeries,
          largeSeries,
          dualAxis,
          showDualAxisButton,
          activeFilterLabels,
          compactMobileLayout,
        }),
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Chart option build failed:', error);
      return { option: undefined, error: message };
    }
  }, [
    activeFilterLabels,
    baseSeries,
    compactMobileLayout,
    dualAxis,
    filteredSeries,
    filteredTopicData,
    largeSeries,
    showDualAxisButton,
    topic,
    renderSafetyWarning,
  ]);

  React.useEffect(() => {
    applyMusicStepHighlights(latestMusicStepRef.current);
  }, [applyMusicStepHighlights, chartBuild.option]);

  const latestValues = useMemo(
    () => computeLatestValues(filteredSeries, activeFilterLabels),
    [activeFilterLabels, filteredSeries],
  );

  const displayTitle = query.data?.title ?? topic.title;
  const displayDescription = query.data?.subtitle ?? topic.description;

  const showUnitSelectionHint = seriesDimension === 'unit' && selectedUnits.length === 0;
  const showUnitTooManyHint = unitSelectionTooLarge;
  return (
    <article ref={cardRef} className="batcave-panel relative flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-3xl p-5 shadow-card backdrop-blur-xl">
      {typeof document !== 'undefined'
        ? createPortal(
            <MusicSettingsModal
              open={musicModalOpen}
              onClose={() => setMusicModalOpen(false)}
              musicTempo={musicTempo}
              setMusicTempo={setMusicTempo}
              globalTempoSyncEnabled={globalTempoSyncEnabled}
              setGlobalTempoSyncEnabled={setGlobalTempoSyncEnabled}
              musicPlaybackMode={musicPlaybackMode}
              setMusicPlaybackMode={setMusicPlaybackMode}
              musicVolume={musicVolume}
              setMusicVolume={setMusicVolume}
              musicSwing={musicSwing}
              setMusicSwing={setMusicSwing}
              musicScale={musicScale}
              setMusicScale={setMusicScale}
              musicOctaveShift={musicOctaveShift}
              setMusicOctaveShift={setMusicOctaveShift}
              musicPhaseOffset={musicPhaseOffset}
              setMusicPhaseOffset={setMusicPhaseOffset}
              musicInstrument={musicInstrument}
              setMusicInstrument={setMusicInstrument}
              musicDelayTime={musicDelayTime}
              setMusicDelayTime={setMusicDelayTime}
              musicDelayFeedback={musicDelayFeedback}
              setMusicDelayFeedback={setMusicDelayFeedback}
              musicReverbWet={musicReverbWet}
              setMusicReverbWet={setMusicReverbWet}
              musicReverbDecay={musicReverbDecay}
              setMusicReverbDecay={setMusicReverbDecay}
              musicArpeggiate={musicArpeggiate}
              setMusicArpeggiate={setMusicArpeggiate}
              globalRecordingSupported={globalRecordingSupported}
              globalRecordingBusy={globalRecordingBusy}
              globalRecording={globalRecording}
              onGlobalRecording={() => {
                void handleGlobalRecording();
              }}
            />,
            document.body,
          )
        : null}

      <button
        type="button"
        onClick={() => onRemove(cardId)}
        aria-label="Remove chart"
        className="bat-btn bat-btn-danger absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold"
      >
        x
      </button>

      <ChartCardHeader
        topicId={topicId}
        datasetCode={topic.datasetCode}
        title={displayTitle}
        description={displayDescription}
        pubmed={topic.pubmed}
        forecastDisabledReason={query.data?.forecastDisabledReason}
        warning={query.data?.warning}
        missingGeos={missingGeos}
        chartError={chartBuild.error}
        geoValues={geoValues}
        setGeoValues={setGeoValues}
        seriesDimension={seriesDimension}
        setSeriesDimension={setSeriesDimension}
        dimensionFilters={dimensionFilters}
        setDimensionFilters={setDimensionFilters}
        availableDimensions={availableDimensions}
        isSeriesTruncated={(query.data?.series?.length ?? 0) > MAX_SERIES_TO_RENDER}
        maxSeriesToRender={MAX_SERIES_TO_RENDER}
        geoSuggestions={query.data?.availableGeos}
        availableGeos={query.data?.availableGeos}
        availableGeoCandidates={availableGeoCandidates}
        isLoadingAvailableGeos={isLoadingAvailableGeos}
        onFetchAvailableGeos={fetchAndApplyAvailableGeos}
      />

      {query.isLoading ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
            <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
          </div>
          <div className="h-[22rem] animate-pulse rounded-3xl bg-white/5" />
        </div>
      ) : null}

      {query.isError ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">
          <div className="text-lg font-semibold">Could not load this topic right now.</div>
          <p className="max-w-2xl text-sm leading-6 text-rose-100/90">
            {(query.error as Error).message} This can happen if the {providerName} API changes filters,
            indicator metadata, or is temporarily unavailable.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => query.refetch()}
              className="rounded-2xl bg-white/90 px-4 py-2 text-sm font-medium text-rose-900 transition hover:bg-white"
            >
              Retry
            </button>
            <a
              href={topic.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-white/30 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Open source dataset
            </a>
          </div>
        </div>
      ) : null}

      {showUnitSelectionHint ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-amber-100">
          <div className="text-lg font-semibold">Select units to continue</div>
          <p className="max-w-2xl text-sm leading-6 text-amber-100/90">
            To avoid large downloads, you must choose at least one unit when splitting by unit.
          </p>
        </div>
      ) : showUnitTooManyHint ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">
          <div className="text-lg font-semibold">Too many units selected</div>
          <p className="max-w-2xl text-sm leading-6 text-rose-100/90">
            Splitting by unit with more than 3 selected units can crash the chart. Please reduce your selection.
          </p>
        </div>
      ) : renderSafetyWarning ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-amber-100">
          <div className="text-lg font-semibold">Dataset too large to render</div>
          <p className="max-w-2xl text-sm leading-6 text-amber-100/90">{renderSafetyWarning}</p>
        </div>
      ) : query.data && query.data.series.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">
          <div className="text-lg font-semibold">No data is available for the selected filters.</div>
          <p className="max-w-2xl text-sm leading-6 text-rose-100/90">
            {query.data.warning ?? 'Try changing the selected countries, time range, or dimension filters.'}
          </p>
        </div>
      ) : query.data && filteredSeries.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-amber-100">
          <div className="text-lg font-semibold">No points in selected period range.</div>
          <p className="max-w-2xl text-sm leading-6 text-amber-100/90">
            Expand the date range to include available observations.
          </p>
        </div>
      ) : query.data && chartBuild.option ? (
        <>
          <LatestValuesGrid
            latestValues={latestValues}
            decimals={query.data.decimals}
            unitSuffix={query.data.unitSuffix}
          />

          <ChartCardToolbar
            selectablePeriods={selectablePeriods}
            periodStart={periodStart}
            onPeriodStartChange={setPeriodStart}
            periodEnd={periodEnd}
            onPeriodEndChange={setPeriodEnd}
            musicPlaying={musicPlaying}
            onToggleMusic={() => {
              void toggleMusicPlayback();
            }}
            onOpenMusicSettings={() => setMusicModalOpen(true)}
            showDualAxisButton={showDualAxisButton}
            dualAxis={dualAxis}
            onToggleDualAxis={() => setDualAxis((prev) => !prev)}
            supportsForecast={supportsForecast}
            forecastHorizon={forecastHorizon}
            onForecastHorizonChange={setForecastHorizon}
            forecastOptions={forecastOptions}
            forecastUnitLabel={forecastUnitLabel}
          />

          <div className="min-h-[22rem] min-w-0 flex-1 overflow-hidden rounded-3xl border border-border bg-slate-950/60 p-3">
            <ReactECharts
            ref={chartRef}
            option={chartBuild.option}
            notMerge
            lazyUpdate
            autoResize
            style={{ width: '100%', maxWidth: '100%', height: '100%', minHeight: '22rem' }}
          />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <span className="min-w-0 break-words">{query.data.subtitle}</span>
            <a href={query.data.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200">
              {sourceLinkLabel} ↗
            </a>
          </div>
        </>
      ) : null}
    </article>
  );
}

export const ChartCard = React.memo(ChartCardComponent);
