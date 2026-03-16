import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { TOPIC_MAP } from '../features/dashboard/topicCatalog';
import type { TopicDefinition } from '../features/dashboard/types';
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
};

const MAX_RENDER_SERIES = 40;
const MAX_SERIES_TO_RENDER = 16;

export function ChartCard({ cardId, topicId, onRemove }: ChartCardProps) {
  const topic = useMemo<TopicDefinition>(
    () =>
      TOPIC_MAP[topicId] ?? {
        id: topicId,
        title: topicId,
        description: `Eurostat dataset ${topicId}`,
        datasetCode: topicId,
        filters: {},
        geoValues: ['EE', 'EU27_2020'],
        decimals: 0,
        sourceUrl: `https://ec.europa.eu/eurostat/databrowser/view/${topicId}/default/table?lang=en`,
      },
    [topicId],
  );

  const [forecastHorizon, setForecastHorizon] = useLocalStorage<number>('forecastHorizon', 20);
  const [dimensionFilters, setDimensionFilters] = React.useState<Record<string, string>>({});
  const [availableDimensions, setAvailableDimensions] = React.useState<DimensionOption[]>([]);
  const [seriesDimension, setSeriesDimension] = React.useState('');
  const [geoValues, setGeoValues] = React.useState<string[]>(topic.geoValues ?? ['EE', 'EU27_2020']);
  const [geoInput, setGeoInput] = React.useState('');
  const [dualAxis, setDualAxis] = React.useState(true);
  const [musicPlaying, setMusicPlaying] = React.useState(false);
  const musicPlayerRef = React.useRef<DataPointMusicPlayer | null>(null);

  const defaultGeoValues = useMemo(() => topic.geoValues ?? ['EE', 'EU27_2020'], [topic.geoValues]);

  React.useEffect(() => {
    setDimensionFilters({});
    setAvailableDimensions([]);
    setSeriesDimension('');
    setGeoValues(defaultGeoValues);
  }, [defaultGeoValues, topicId]);

  const query = useQuery({
    queryKey: ['topic-data', topicId, forecastHorizon, dimensionFilters, seriesDimension, geoValues],
    queryFn: () => {
      const activeFilters = Object.fromEntries(
        Object.entries(dimensionFilters).filter(([key]) => key !== seriesDimension),
      );

      return fetchTopicData(topicId, {
        forecastHorizon,
        filters: activeFilters,
        seriesDimension,
        geoValues,
      });
    },
  });

  const effectiveSeries = useMemo(
    () => query.data?.series.slice(0, MAX_RENDER_SERIES) ?? [],
    [query.data],
  );
  const baseSeries = effectiveSeries.filter((series) => !series.label.includes('(forecast)'));

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
      .map(([key, value]) => findDimensionValueLabel(availableDimensions, key, value));
  }, [availableDimensions, dimensionFilters, query.data]);

  const chartBuild = useMemo(() => {
    if (!query.data || query.data.series.length === 0) {
      return { option: undefined, error: null as string | null };
    }

    try {
      return {
        option: buildChartOption({
          topicId,
          topic,
          data: query.data,
          effectiveSeries,
          baseSeries,
          largeSeries,
          dualAxis,
          showDualAxisButton,
          activeFilterLabels,
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
    effectiveSeries,
    largeSeries,
    query.data,
    showDualAxisButton,
    topic,
    topicId,
  ]);

  const latestValues = useMemo(
    () => computeLatestValues(effectiveSeries, activeFilterLabels),
    [activeFilterLabels, effectiveSeries],
  );

  React.useEffect(() => {
    if (!musicPlayerRef.current) {
      musicPlayerRef.current = new DataPointMusicPlayer(effectiveSeries);
      return;
    }
    musicPlayerRef.current.setSeries(effectiveSeries);

    if (effectiveSeries.length === 0 && musicPlaying) {
      setMusicPlaying(false);
    }
  }, [effectiveSeries, musicPlaying]);

  React.useEffect(() => () => {
    musicPlayerRef.current?.dispose();
    musicPlayerRef.current = null;
  }, []);

  const displayTitle = query.data?.title ?? topic.title;
  const displayDescription = query.data?.subtitle ?? topic.description;

  return (
    <article className="batcave-panel relative flex min-h-[30rem] flex-col rounded-3xl p-5 shadow-card backdrop-blur-xl">
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
        geoInput={geoInput}
        setGeoInput={setGeoInput}
        setGeoValues={setGeoValues}
        seriesDimension={seriesDimension}
        setSeriesDimension={setSeriesDimension}
        dimensionFilters={dimensionFilters}
        setDimensionFilters={setDimensionFilters}
        availableDimensions={availableDimensions}
        isSeriesTruncated={(query.data?.series?.length ?? 0) > MAX_SERIES_TO_RENDER}
        maxSeriesToRender={MAX_SERIES_TO_RENDER}
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
            {(query.error as Error).message} This can happen if Eurostat changes a dataset filter or the API
            is temporarily unavailable.
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

      {query.data && query.data.series.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">
          <div className="text-lg font-semibold">No data is available for the selected filters.</div>
          <p className="max-w-2xl text-sm leading-6 text-rose-100/90">
            {query.data.warning ?? 'Try changing the selected countries, time range, or dimension filters.'}
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
            <button
              type="button"
              onClick={async () => {
                const player = musicPlayerRef.current;
                if (!player) return;
                try {
                  const playing = await player.toggle();
                  setMusicPlaying(playing);
                } catch (error) {
                  console.error('Could not start data music:', error);
                  setMusicPlaying(false);
                }
              }}
              className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
            >
              {musicPlaying ? 'Data music: on' : 'Data music: off'}
            </button>

            {showDualAxisButton ? (
              <button
                type="button"
                onClick={() => setDualAxis((prev) => !prev)}
                className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
              >
                {dualAxis ? 'Dual axes: on' : 'Dual axes: off'}
              </button>
            ) : null}

            <label className="bat-btn flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium">
              <span className="whitespace-nowrap">Forecast:</span>
              <select
                value={forecastHorizon}
                onChange={(event) => setForecastHorizon(Number(event.target.value))}
                className="bat-input rounded-xl px-2 py-1 text-xs text-white outline-none"
              >
                {[5, 10, 20, 30].map((value) => (
                  <option key={value} value={value}>
                    {value}y
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="min-h-[22rem] flex-1 rounded-3xl border border-border bg-slate-950/60 p-3">
            <ReactECharts
            option={chartBuild.option}
            notMerge
            lazyUpdate
            style={{ height: '100%', minHeight: '22rem' }}
          />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <span>{query.data.subtitle}</span>
            <a href={query.data.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200">
              Eurostat dataset ↗
            </a>
          </div>
        </>
      ) : null}
    </article>
  );
}
