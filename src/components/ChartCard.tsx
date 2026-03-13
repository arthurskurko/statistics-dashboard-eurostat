import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { fetchTopicData } from '../lib/eurostat';
import { TOPIC_MAP } from '../features/dashboard/topicCatalog';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { DataSeries } from '../features/dashboard/types';

const FRIENDLY_DIMENSION_LABELS: Record<string, string> = {
  sex: 'Sex',
  age: 'Age',
  unit: 'Unit',
  freq: 'Frequency',
  agedef: 'Age definition',
  c_birth: 'Birth cohort',
  s_adj: 'Seasonal adjustment',
  coicop: 'COICOP',
  ord_brth: 'Order of birth',
};

function friendlyDimensionLabel(id: string): string {
  if (FRIENDLY_DIMENSION_LABELS[id]) return FRIENDLY_DIMENSION_LABELS[id];
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function findDimensionValueLabel(
  dimensions: Array<{ id: string; values: Array<{ code: string; label: string }> }>,
  dimId: string,
  code: string,
): string {
  const dim = dimensions.find((d) => d.id === dimId);
  if (!dim) return code;
  return dim.values.find((v) => v.code === code)?.label ?? code;
}

type ChartCardProps = {
  cardId: string;
  topicId: string;
  onRemove: (cardId: string) => void;
};


function formatValue(value: number, decimals: number, unitSuffix?: string) {
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });

  if (unitSuffix === '€') {
    return `${formatter.format(value)} ${unitSuffix}`;
  }

  return unitSuffix ? `${formatter.format(value)}${unitSuffix}` : formatter.format(value);
}

export function ChartCard({ cardId, topicId, onRemove }: ChartCardProps) {
  const topic = TOPIC_MAP[topicId] ?? {
    id: topicId,
    title: topicId,
    description: `Eurostat dataset ${topicId}`,
    datasetCode: topicId,
    filters: {},
    geoValues: ['EE', 'EU27_2020'],
    decimals: 0,
    sourceUrl: `https://ec.europa.eu/eurostat/databrowser/view/${topicId}/default/table?lang=en`,
  };

  const [forecastHorizon, setForecastHorizon] = useLocalStorage<number>('forecastHorizon', 20);
  const [dimensionFilters, setDimensionFilters] = React.useState<Record<string, string>>({});
  const [availableDimensions, setAvailableDimensions] = React.useState<
    Array<{ id: string; label: string; values: Array<{ code: string; label: string }> }>
  >([]);
  const [seriesDimension, setSeriesDimension] = React.useState<string>('');

  // Reset any custom dimension filters when the selected topic changes.
  React.useEffect(() => {
    setDimensionFilters({});
    setAvailableDimensions([]);
    setSeriesDimension('');
  }, [topicId]);

  const query = useQuery({
    queryKey: ['topic-data', topicId, forecastHorizon, dimensionFilters, seriesDimension],
    queryFn: () => {
      const activeFilters = Object.fromEntries(
        Object.entries(dimensionFilters).filter(([key]) => key !== seriesDimension),
      );

      return fetchTopicData(topicId, {
        forecastHorizon,
        filters: activeFilters,
        seriesDimension,
      });
    },
  });

  // toggle to enable dual‑axis plotting when there are two series; users can
  // switch it on/off via a button in the card header.  Defaults to off so that
  // the existing behaviour remains unless the user explicitly enables it.
  const [dualAxis, setDualAxis] = React.useState(true);

  const baseSeries = query.data?.series.filter((s) => !s.label.includes('(forecast)')) ?? [];
  const showDualAxisButton = baseSeries.length === 2;

  React.useEffect(() => {
    if (!query.data?.extraDimensions) return;

    if (availableDimensions.length === 0) {
      setAvailableDimensions(query.data.extraDimensions);
    }

    // Reset filters if the available dimensions change (e.g., because the selected topic changed).
    // We don’t auto-select values: users can opt in to applying additional filters.
    if (
      Object.keys(dimensionFilters).length > 0 &&
      !query.data.extraDimensions.some((dim) => Object.keys(dimensionFilters).includes(dim.id))
    ) {
      setDimensionFilters({});
    }
  }, [query.data, availableDimensions.length, dimensionFilters]);

const activeFilterLabels = useMemo(() => {
    if (!query.data) return [];
    return Object.entries(dimensionFilters)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => findDimensionValueLabel(availableDimensions, key, value));
  }, [availableDimensions, dimensionFilters, query.data]);

  const chartOption = useMemo(() => {
    if (!query.data) {
      return undefined;
    }
    // debug: print period/series info when showing induced abortions
    if (topicId === 'induced-abortions') {
      // eslint-disable-next-line no-console
      console.log('DEBUG induced:', query.data.periods, query.data.series.map(s => ({label: s.label, points: s.points.slice(-3)})));
    }

    // use the full list of periods returned by the query to ensure earlier
    // years appear even if one of the series has no observation for them.
    const xAxis = query.data.periods;

    // Only count non-forecast series when deciding if dual axes should be enabled.
    const twoSeries = showDualAxisButton;

    const baseColors = new Map<string, string>([
      ['Estonia', '#00e676'],
      ['European Union - 27 countries (from 2020)', '#4c9aff'],
    ]);

    const palette = ['#00e676', '#4c9aff', '#f97316', '#a855f7', '#facc15', '#ec4899', '#22c55e', '#38bdf8', '#f43f5e'];
    const colorMap = new Map<string, string>(baseColors);

    // Ensure all base series (excluding forecast versions) have distinct colors.
    let nextPaletteIndex = 0;
    query.data.series
      .map((s) => s.label.replace(/ \(forecast\)$/, ''))
      .filter((label, index, arr) => arr.indexOf(label) === index)
      .forEach((baseLabel) => {
        if (!colorMap.has(baseLabel)) {
          colorMap.set(baseLabel, palette[nextPaletteIndex % palette.length]);
          nextPaletteIndex += 1;
        }
      });

    const filterSuffix = activeFilterLabels.length > 0 ? ` (${activeFilterLabels.join(', ')})` : '';

    const option: any = {
      animationDuration: 400,
      backgroundColor: 'transparent',
    };

    option.tooltip = {
      trigger: 'axis',
      formatter: (params: any) => {
        // remove forecast series from tooltip
        const lines: string[] = [];
        params.forEach((p: any) => {
          if (!p.seriesName.includes('(forecast)')) {
            const val = p.value == null ? 'n/a' : formatValue(p.value, query.data.decimals, query.data.unitSuffix);
            lines.push(`${p.marker} ${p.seriesName}: ${val}`);
          }
        });
        return lines.join('<br/>');
      },
    };
    option.legend = {
      top: 0,
      textStyle: {
        color: '#cbd5e1',
      },
      // only show base (non-forecast) series in legend
      data: baseSeries.map((s) => s.label),
      inactiveColor: '#999999',
    };
    option.grid = {
      left: 16,
      right: 16,
      top: 56,
      bottom: 8,
      containLabel: true,
    };
    option.xAxis = {
      type: 'category',
      data: xAxis,
      axisLabel: {
        color: '#94a3b8',
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(148, 163, 184, 0.2)',
        },
      },
    };
const axisColors = baseSeries.map((s) => {
        const baseLabel = s.label.replace(/ \(forecast\)$/, '');
        return colorMap.get(baseLabel) ?? '#4c9aff';
      });

    option.yAxis = twoSeries && dualAxis
      ? [
          {
            type: 'value',
            axisLabel: { color: axisColors[0] ?? '#94a3b8' },
            axisLine: { lineStyle: { color: axisColors[0] ?? '#94a3b8' } },
            splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
          },
          {
            type: 'value',
            axisLabel: { color: axisColors[1] ?? '#94a3b8' },
            axisLine: { lineStyle: { color: axisColors[1] ?? '#94a3b8' } },
            splitLine: { show: false },
          },
        ]
      : {
          type: 'value',
          axisLabel: { color: '#94a3b8' },
          splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
        };
    option.series = query.data.series.map((series) => {
      const isForecast = series.label.includes('(forecast)');
      const baseLabel = series.label.replace(/ \(forecast\)$/, '');
      const baseIndex = baseSeries.findIndex((s) => s.label === baseLabel);
      const yAxisIndex = twoSeries && dualAxis && baseIndex >= 0 ? baseIndex : 0;
      const seriesColor = colorMap.get(baseLabel) ?? '#4c9aff';

      return {
        name: `${series.label}${filterSuffix}`,
        type: topic.chartVariant ?? 'line',
        smooth: true,
        showSymbol: false,
        emphasis: { focus: 'series' },
        areaStyle: !isForecast && baseSeries[0]?.label === series.label ? { opacity: 0.12 } : undefined,
        yAxisIndex,
        data: xAxis.map((label) => {
          const point = series.points.find((item) => item.label === label);
          return point?.value ?? null;
        }),
        itemStyle: {
          color: seriesColor,
        },
        lineStyle: {
          width: 3,
          type: isForecast ? 'dashed' : 'solid',
          color: seriesColor,
        },
      };
    });

    // return the fully built option for useMemo
    return option;
  }, [query.data, topic.chartVariant, dualAxis, showDualAxisButton, activeFilterLabels]);

  const latestValues = useMemo(() => {
    if (!query.data) {
      return [];
    }

    const filterSuffix = activeFilterLabels.length > 0 ? ` (${activeFilterLabels.join(', ')})` : '';

    return query.data.series
      .filter((series) => !series.label.includes('(forecast)'))
      .map((series) => {
        const nonForecastPoints = series.points.filter((p) => !p.predicted);
        return {
          label: `${series.label}${filterSuffix}`,
          // Prefer the last real point; fallback to last point if none are marked.
          point: nonForecastPoints.at(-1) ?? series.points.at(-1),
        };
      })
      .filter(
        (entry): entry is { label: string; point: DataSeries['points'][number] } => Boolean(entry.point),
      );
  }, [query.data, activeFilterLabels]);

  const displayTitle = query.data?.title ?? topic.title;
  const displayDescription = query.data?.subtitle ?? topic.description;

  return (
    <article className="flex min-h-[30rem] flex-col rounded-3xl border border-border bg-slate-900/80 p-5 shadow-card backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{topic.datasetCode}</div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">{displayTitle}</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">{displayDescription}</p>

          {(seriesDimension || Object.values(dimensionFilters).some((v) => v)) ? (
            <p className="mt-2 text-sm text-slate-400">
              {seriesDimension ? (
                <span>
                  Split series by <strong>{friendlyDimensionLabel(seriesDimension)}</strong>.
                  {Object.values(dimensionFilters).some((v) => v) && ' '}
                </span>
              ) : null}
              {Object.entries(dimensionFilters)
                .filter(([_, value]) => Boolean(value))
                .map(([key, value], index) => (
                  <span key={key}>
                    {index > 0 && ', '}
                    <strong>{friendlyDimensionLabel(key)}</strong>: {findDimensionValueLabel(availableDimensions, key, value)}
                  </span>
                ))}
            </p>
          ) : null}

          {availableDimensions.filter((dim) => dim.values.length > 1).length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-200">
                <span className="text-slate-400">Split series by</span>
                <div className="flex gap-2">
                  <select
                    value={seriesDimension}
                    onChange={(e) => setSeriesDimension(e.target.value)}
                    className="h-10 rounded-2xl border border-border bg-slate-950/80 px-3 text-sm text-white outline-none transition focus:border-sky-400"
                  >
                    <option value="">(none)</option>
                    {availableDimensions.map((dim) => (
                      <option key={dim.id} value={dim.id}>
                        {friendlyDimensionLabel(dim.id)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setSeriesDimension('');
                      setDimensionFilters({});
                    }}
                    className="rounded-2xl border border-border bg-white/5 px-3 text-xs font-medium text-white transition hover:bg-white/10"
                  >
                    Reset
                  </button>
                </div>
              </label>

              {availableDimensions
                .filter((dim) => dim.values.length > 1 && dim.id !== seriesDimension)
                .map((dim) => (
                  <label key={dim.id} className="flex flex-col gap-1 text-xs text-slate-200">
                    <span className="text-slate-400">{friendlyDimensionLabel(dim.id)}</span>
                    <select
                      value={dimensionFilters[dim.id] ?? ''}
                      onChange={(e) =>
                        setDimensionFilters((prev) => ({
                          ...prev,
                          [dim.id]: e.target.value,
                        }))
                      }
                      className="h-10 rounded-2xl border border-border bg-slate-950/80 px-3 text-sm text-white outline-none transition focus:border-sky-400"
                    >
                      <option value="">(all)</option>
                      {dim.values.map((value) => (
                        <option key={value.code} value={value.code}>
                          {value.label ?? value.code}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {query.data && showDualAxisButton && (
            <button
              type="button"
              onClick={() => setDualAxis((prev) => !prev)}
              className="rounded-2xl border border-border bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10"
            >
              {dualAxis ? 'Dual axes: on' : 'Dual axes: off'}
            </button>
          )}
          {query.data && (
            <label className="flex items-center gap-2 rounded-2xl border border-border bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10">
              <span className="whitespace-nowrap">Forecast:</span>
              <select
                value={forecastHorizon}
                onChange={(e) => setForecastHorizon(Number(e.target.value))}
                className="rounded-xl bg-slate-900/80 px-2 py-1 text-xs text-white outline-none"
              >
                {[5, 10, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n}y
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => onRemove(cardId)}
            className="rounded-2xl border border-border bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Remove
          </button>
        </div>
      </div>

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
            {(query.error as Error).message} This can happen if Eurostat changes a dataset filter or the
            API is temporarily unavailable.
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

      {query.data && chartOption ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {latestValues.map(({ label, point }) => (
              <div key={label} className="rounded-2xl border border-border bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Latest · {label}</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {formatValue(point.value, query.data.decimals, query.data.unitSuffix)}
                </div>
                <div className="mt-1 text-sm text-slate-300">{point.label}</div>
              </div>
            ))}
          </div>

          <div className="min-h-[22rem] flex-1 rounded-3xl border border-border bg-slate-950/60 p-3">
            <ReactECharts option={chartOption} style={{ height: '100%', minHeight: '22rem' }} />
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
