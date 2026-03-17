import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { TOPIC_MAP } from '../features/dashboard/topicCatalog';
import type { TopicData, TopicDefinition } from '../features/dashboard/types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DataPointMusicPlayer } from '../lib/datapointMusic';
import { fetchTopicData } from '../lib/eurostat';
import { buildChartOption } from './chart-card/buildChartOption';
import { ChartCardHeader } from './chart-card/ChartCardHeader';
import { computeLatestValues, findDimensionValueLabel, type DimensionOption } from './chart-card/helpers';
import { LatestValuesGrid } from './chart-card/LatestValuesGrid';

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

function hashString(value: string): number {
  let hash = 0;
  for (let idx = 0; idx < value.length; idx += 1) {
    hash = (hash * 31 + value.charCodeAt(idx)) >>> 0;
  }
  return hash;
}

export function ChartCard({
  cardId,
  topicId,
  onRemove,
  providerId = 'eurostat',
  providerName = 'Eurostat',
  topicMap = TOPIC_MAP,
  fetchTopicDataFn = fetchTopicData,
  defaultGeoValues = DEFAULT_EUROSTAT_GEOS,
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
      },
    [defaultGeoValues, fallbackDescriptionPrefix, sourceUrlBuilder, topicId, topicMap],
  );

  const [forecastHorizon, setForecastHorizon] = useLocalStorage<number>(`${providerId}.forecastHorizon`, 20);
  const [dimensionFilters, setDimensionFilters] = React.useState<Record<string, string | string[]>>({});
  const [availableDimensions, setAvailableDimensions] = React.useState<DimensionOption[]>([]);
  const [seriesDimension, setSeriesDimension] = React.useState('');
  const [geoValues, setGeoValues] = React.useState<string[]>(topic.geoValues ?? defaultGeoValues);
  const [dualAxis, setDualAxis] = React.useState(true);
  const [musicPlaying, setMusicPlaying] = React.useState(false);
  const [musicModalOpen, setMusicModalOpen] = React.useState(false);
  const [musicTempo, setMusicTempo] = React.useState(120);
  const [musicScale, setMusicScale] = React.useState<'major' | 'minor' | 'pentatonic' | 'chromatic'>('major');
  const [musicOctaveShift, setMusicOctaveShift] = React.useState(0);
  const [musicInstrument, setMusicInstrument] = React.useState<OscillatorType | 'auto'>('auto');
  const [musicArpeggiate, setMusicArpeggiate] = React.useState(false);
  const [musicSwing, setMusicSwing] = React.useState(0.08);
  const [musicDelayTime, setMusicDelayTime] = React.useState(0.18);
  const [musicDelayFeedback, setMusicDelayFeedback] = React.useState(0.35);
  const [musicReverbWet, setMusicReverbWet] = React.useState(0.18);
  const [musicReverbDecay, setMusicReverbDecay] = React.useState(2.4);
  const [musicVolume, setMusicVolume] = React.useState(1);
  const [musicPhaseOffset, setMusicPhaseOffset] = React.useState(0);
  const [periodStart, setPeriodStart] = React.useState('');
  const [periodEnd, setPeriodEnd] = React.useState('');
  const [globalRecording, setGlobalRecording] = React.useState(() => DataPointMusicPlayer.isGlobalRecording());
  const [globalRecordingBusy, setGlobalRecordingBusy] = React.useState(false);

  React.useEffect(() => {
    // Give each chart an automatic phase offset so multiple charts in the dashboard
    // don't all play the exact same step at the same time.
    setMusicPhaseOffset(hashString(cardId) % 16);
  }, [cardId]);
  const musicPlayerRef = React.useRef<DataPointMusicPlayer | null>(null);
  const chartRef = React.useRef<ReactECharts | null>(null);
  const [compactMobileLayout, setCompactMobileLayout] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncCompactLayout = () => setCompactMobileLayout(window.innerWidth < 640);
    const triggerResize = () => {
      window.requestAnimationFrame(() => {
        chartRef.current?.getEchartsInstance().resize();
      });
      window.setTimeout(() => {
        chartRef.current?.getEchartsInstance().resize();
      }, 220);
    };

    const onViewportChange = () => {
      syncCompactLayout();
      triggerResize();
    };

    syncCompactLayout();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);

    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
    };
  }, []);

  const resolvedDefaultGeos = useMemo(() => topic.geoValues ?? defaultGeoValues, [defaultGeoValues, topic.geoValues]);

  React.useEffect(() => {
    setDimensionFilters({});
    setAvailableDimensions([]);
    setSeriesDimension('');
    setGeoValues((current) =>
      areStringArraysEqual(current, resolvedDefaultGeos) ? current : resolvedDefaultGeos,
    );
  }, [resolvedDefaultGeos, topicId]);

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

  const baseSeries = filteredSeries.filter((series) => !series.label.includes('(forecast)'));

  const seriesMax = baseSeries.map((series) => ({
    label: series.label,
    max: Math.max(...series.points.map((point) => point.value), 0),
  }));
  const overallMax = Math.max(...seriesMax.map((series) => series.max), 0);
  const largeThreshold = overallMax * 0.25;
  const largeSeries = seriesMax.filter((series) => series.max >= largeThreshold).map((series) => series.label);
  const smallSeries = seriesMax.filter((series) => series.max < largeThreshold).map((series) => series.label);
  const showDualAxisButton = largeSeries.length > 0 && smallSeries.length > 0;

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

  const chartBuild = useMemo(() => {
    if (!filteredTopicData || filteredTopicData.series.length === 0) {
      return { option: undefined, error: null as string | null };
    }

    try {
      return {
        option: buildChartOption({
          topicId,
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
    dualAxis,
    filteredSeries,
    filteredTopicData,
    largeSeries,
    showDualAxisButton,
    topic,
    topicId,
    compactMobileLayout,
  ]);

  const latestValues = useMemo(
    () => computeLatestValues(filteredSeries, activeFilterLabels),
    [activeFilterLabels, filteredSeries],
  );

  // Tempo is local to the chart; no global sync.
  // (Tempo is stored in component state and passed directly to the player.)

  React.useEffect(() => {
    if (!musicPlayerRef.current) {
      musicPlayerRef.current = new DataPointMusicPlayer(filteredSeries, {
        tempoBpm: musicTempo,
        scale: musicScale,
        octaveShift: musicOctaveShift,
        instrumentOverride: musicInstrument,
        arpeggiate: musicArpeggiate,
        swing: musicSwing,
        delayTime: musicDelayTime,
        delayFeedback: musicDelayFeedback,
        reverbWet: musicReverbWet,
        reverbDecay: musicReverbDecay,
        volume: musicVolume,
      });
      musicPlayerRef.current.setPhaseOffset(musicPhaseOffset);
      return;
    }

    musicPlayerRef.current.setSeries(filteredSeries);
    musicPlayerRef.current.setTempo(musicTempo);
    musicPlayerRef.current.setSwing(musicSwing);
    musicPlayerRef.current.setScale(musicScale);
    musicPlayerRef.current.setOctaveShift(musicOctaveShift);
    musicPlayerRef.current.setInstrumentOverride(musicInstrument);
    musicPlayerRef.current.setArpeggiate(musicArpeggiate);
    musicPlayerRef.current.setDelayTime(musicDelayTime);
    musicPlayerRef.current.setDelayFeedback(musicDelayFeedback);
    musicPlayerRef.current.setReverbWet(musicReverbWet);
    musicPlayerRef.current.setReverbDecay(musicReverbDecay);
    musicPlayerRef.current.setVolume(musicVolume);
    musicPlayerRef.current.setPhaseOffset(musicPhaseOffset);

    if (filteredSeries.length === 0 && musicPlaying) {
      setMusicPlaying(false);
    }
  }, [
    filteredSeries,
    musicPlaying,
    musicTempo,
    musicSwing,
    musicScale,
    musicOctaveShift,
    musicInstrument,
    musicArpeggiate,
    musicDelayTime,
    musicDelayFeedback,
    musicReverbWet,
    musicReverbDecay,
    musicVolume,
    musicPhaseOffset,
  ]);

  React.useEffect(() => () => {
    musicPlayerRef.current?.dispose();
    musicPlayerRef.current = null;
  }, []);

  React.useEffect(() => {
    const syncRecordingState = () => setGlobalRecording(DataPointMusicPlayer.isGlobalRecording());
    window.addEventListener('datapoint-music-recording-change', syncRecordingState);
    return () => {
      window.removeEventListener('datapoint-music-recording-change', syncRecordingState);
    };
  }, []);

  const globalRecordingSupported = DataPointMusicPlayer.canRecordGlobalMix();

  const handleGlobalRecording = React.useCallback(async () => {
    try {
      setGlobalRecordingBusy(true);

      if (!globalRecording) {
        await DataPointMusicPlayer.startGlobalRecording();
        setGlobalRecording(true);
        return;
      }

      const blob = await DataPointMusicPlayer.stopGlobalRecording();
      setGlobalRecording(false);

      const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${providerId}-global-mix-${timestamp}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Global mix recording failed:', error);
    } finally {
      setGlobalRecordingBusy(false);
    }
  }, [globalRecording, providerId]);

  const displayTitle = query.data?.title ?? topic.title;
  const displayDescription = query.data?.subtitle ?? topic.description;

  const showUnitSelectionHint = seriesDimension === 'unit' && selectedUnits.length === 0;
  const showUnitTooManyHint = unitSelectionTooLarge;
  const musicModal = musicModalOpen ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:py-6">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/20 bg-slate-950/95 shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Data music controls</h2>
            <p className="mt-1 text-sm text-slate-300">Tweak tempo, scale and the synthesis style.</p>
          </div>
          <button
            type="button"
            onClick={() => setMusicModalOpen(false)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm text-slate-200">
          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Tempo</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={30}
                max={240}
                value={musicTempo}
                onChange={(event) => setMusicTempo(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{musicTempo} bpm</span>
            </div>
          </label>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Volume</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={musicVolume}
                onChange={(event) => setMusicVolume(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(musicVolume * 100)}%</span>
            </div>
          </label>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Swing</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={musicSwing}
                onChange={(event) => setMusicSwing(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(musicSwing * 100)}%</span>
            </div>
          </label>


          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Scale</span>
            <select
              value={musicScale}
              onChange={(event) => setMusicScale(event.target.value as 'major' | 'minor' | 'pentatonic' | 'chromatic')}
              className="bat-input w-full rounded-2xl px-3 py-2 text-sm text-white outline-none"
            >
              <option value="major">Major</option>
              <option value="minor">Minor</option>
              <option value="pentatonic">Pentatonic</option>
              <option value="chromatic">Chromatic</option>
            </select>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="font-medium text-slate-100">Octave shift</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-3}
                  max={3}
                  step={1}
                  value={musicOctaveShift}
                  onChange={(event) => setMusicOctaveShift(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer accent-emerald-400"
                />
                <span className="w-10 text-right text-xs text-slate-200">{musicOctaveShift}</span>
              </div>
            </label>

            <label className="grid gap-2">
              <span className="font-medium text-slate-100">Phase offset</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={16}
                  step={1}
                  value={musicPhaseOffset}
                  onChange={(event) => setMusicPhaseOffset(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer accent-emerald-400"
                />
                <span className="w-10 text-right text-xs text-slate-200">{musicPhaseOffset}</span>
              </div>
              <p className="text-xs text-slate-500">Shift the timing of this chart (16th-note increments) relative to others.</p>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="font-medium text-slate-100">Instrument</span>
            <select
              value={musicInstrument}
              onChange={(event) => setMusicInstrument(event.target.value as OscillatorType | 'auto')}
              className="bat-input w-full rounded-2xl px-3 py-2 text-sm text-white outline-none"
            >
              <option value="auto">Auto</option>
              <option value="sine">Sine</option>
              <option value="triangle">Triangle</option>
              <option value="square">Square</option>
              <option value="sawtooth">Sawtooth</option>
            </select>
          </label>

          <div className="grid gap-2">
            <span className="font-medium text-slate-100">Delay</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.02}
                value={musicDelayTime}
                onChange={(event) => setMusicDelayTime(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{musicDelayTime.toFixed(2)}s</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Feedback</span>
              <input
                type="range"
                min={0}
                max={0.95}
                step={0.01}
                value={musicDelayFeedback}
                onChange={(event) => setMusicDelayFeedback(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-12 text-right text-xs text-slate-200">{Math.round(musicDelayFeedback * 100)}%</span>
            </div>
          </div>

          <div className="grid gap-2">
            <span className="font-medium text-slate-100">Reverb</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={musicReverbWet}
                onChange={(event) => setMusicReverbWet(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{Math.round(musicReverbWet * 100)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Decay</span>
              <input
                type="range"
                min={0.5}
                max={6}
                step={0.1}
                value={musicReverbDecay}
                onChange={(event) => setMusicReverbDecay(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-400"
              />
              <span className="w-14 text-right text-xs text-slate-200">{musicReverbDecay.toFixed(1)}s</span>
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={musicArpeggiate}
              onChange={(event) => setMusicArpeggiate(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-400"
            />
            <span className="text-sm text-slate-200">Arpeggiate (play one series at a time)</span>
          </label>

          <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">
            Tip: Try slow tempo with pentatonic scale for an ambient vibe, or crank tempo + sawtooth for
            intense “cyber soundtrack” energy.
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Global mix export</div>
            <button
              type="button"
              onClick={() => {
                void handleGlobalRecording();
              }}
              disabled={!globalRecordingSupported || globalRecordingBusy}
              className="bat-btn w-full rounded-2xl px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!globalRecordingSupported
                ? 'Recording not supported on this browser'
                : globalRecording
                  ? (globalRecordingBusy ? 'Stopping and preparing download...' : 'Stop and download global mix')
                  : (globalRecordingBusy ? 'Starting global recording...' : 'Record global mix')}
            </button>
            <p className="mt-2 text-xs text-slate-400">
              Captures all chart music currently routed through the app into one audio file.
            </p>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <article className="batcave-panel relative flex min-h-[30rem] flex-col rounded-3xl p-5 shadow-card backdrop-blur-xl">
      {musicModal && typeof document !== 'undefined' ? createPortal(musicModal, document.body) : null}

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

          <div className="bat-chart-toolbar mb-3 flex flex-wrap items-center justify-end gap-2 rounded-2xl px-3 py-2">
            {selectablePeriods.length > 1 ? (
              <>
                <label className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium">
                  <span className="whitespace-nowrap">From:</span>
                  <select
                    value={periodStart}
                    onChange={(event) => setPeriodStart(event.target.value)}
                    className="bat-input rounded-xl px-2 py-1 text-xs text-white outline-none"
                  >
                    {selectablePeriods.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium">
                  <span className="whitespace-nowrap">To:</span>
                  <select
                    value={periodEnd}
                    onChange={(event) => setPeriodEnd(event.target.value)}
                    className="bat-input rounded-xl px-2 py-1 text-xs text-white outline-none"
                  >
                    {selectablePeriods.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <button
              type="button"
              onClick={async () => {
                const player = musicPlayerRef.current;
                if (!player) return;
                try {
                  await player.unlockAudio();
                  const playing = await player.toggle();
                  setMusicPlaying(playing);
                  if (!playing) setMusicModalOpen(false);
                } catch (error) {
                  console.error('Could not start data music:', error);
                  setMusicPlaying(false);
                }
              }}
              className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
            >
              {musicPlaying ? 'Data music: on' : 'Data music: off'}
            </button>

            {musicPlaying ? (
              <button
                type="button"
                onClick={() => setMusicModalOpen(true)}
                className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium"
              >
                🎵 Music settings
              </button>
            ) : null}

            {showDualAxisButton ? (
              <button
                type="button"
                onClick={() => setDualAxis((prev) => !prev)}
                className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
              >
                {dualAxis ? 'Dual axes: on' : 'Dual axes: off'}
              </button>
            ) : null}

            {supportsForecast ? (
              <label className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium">
                <span className="whitespace-nowrap">Forecast:</span>
                <select
                  value={forecastHorizon}
                  onChange={(event) => setForecastHorizon(Number(event.target.value))}
                  className="bat-input rounded-xl px-2 py-1 text-xs text-white outline-none"
                >
                  {forecastOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}{forecastUnitLabel}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="min-h-[22rem] flex-1 rounded-3xl border border-border bg-slate-950/60 p-3">
            <ReactECharts
            ref={chartRef}
            option={chartBuild.option}
            notMerge
            lazyUpdate
            autoResize
            style={{ height: '100%', minHeight: '22rem' }}
          />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <span>{query.data.subtitle}</span>
            <a href={query.data.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200">
              {sourceLinkLabel} ↗
            </a>
          </div>
        </>
      ) : null}
    </article>
  );
}
