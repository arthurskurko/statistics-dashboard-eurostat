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

const KNOWN_GEOS: Array<{ code: string; label: string }> = [
  { code: 'EE', label: 'Estonia' },
  { code: 'EU27_2020', label: 'European Union - 27 countries (from 2020)' },
  { code: 'BE', label: 'Belgium' },
  { code: 'BG', label: 'Bulgaria' },
  { code: 'CZ', label: 'Czechia' },
  { code: 'DK', label: 'Denmark' },
  { code: 'DE', label: 'Germany' },
  { code: 'DE_TOT', label: 'Germany including former GDR' },
  { code: 'IE', label: 'Ireland' },
  { code: 'ES', label: 'Spain' },
  { code: 'FR', label: 'France' },
  { code: 'FX', label: 'Metropolitan France' },
  { code: 'HR', label: 'Croatia' },
  { code: 'IT', label: 'Italy' },
  { code: 'LV', label: 'Latvia' },
  { code: 'LT', label: 'Lithuania' },
  { code: 'HU', label: 'Hungary' },
  { code: 'PL', label: 'Poland' },
  { code: 'PT', label: 'Portugal' },
  { code: 'RO', label: 'Romania' },
  { code: 'SI', label: 'Slovenia' },
  { code: 'SK', label: 'Slovakia' },
  { code: 'FI', label: 'Finland' },
  { code: 'SE', label: 'Sweden' },
  { code: 'IS', label: 'Iceland' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'UK', label: 'United Kingdom' },
  { code: 'ME', label: 'Montenegro' },
  { code: 'MD', label: 'Moldova' },
  { code: 'GE', label: 'Georgia' },
  { code: 'AL', label: 'Albania' },
  { code: 'RS', label: 'Serbia' },
  { code: 'UA', label: 'Ukraine' },
  { code: 'BY', label: 'Belarus' },
  { code: 'RU', label: 'Russia' },
  { code: 'SM', label: 'San Marino' },
  { code: 'AM', label: 'Armenia' },
  { code: 'AZ', label: 'Azerbaijan' },
  { code: 'PS', label: 'Palestine' },
];

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
  const [geoValues, setGeoValues] = React.useState<string[]>(topic.geoValues ?? ['EE', 'EU27_2020']);
  const [geoInput, setGeoInput] = React.useState('');
  const [missingGeos, setMissingGeos] = React.useState<string[]>([]);

  // Reset any custom dimension filters when the selected topic changes.
  React.useEffect(() => {
    setDimensionFilters({});
    setAvailableDimensions([]);
    setSeriesDimension('');
    setGeoValues(topic.geoValues ?? ['EE']);
  }, [topicId]);

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

  // toggle to enable dual‑axis plotting when there are two series; users can
  // switch it on/off via a button in the card header.  Defaults to off so that
  // the existing behaviour remains unless the user explicitly enables it.
  const [dualAxis, setDualAxis] = React.useState(false);
  const [chartError, setChartError] = React.useState<string | null>(null);

  const MAX_RENDER_SERIES = 40;
  const effectiveSeries = query.data?.series.slice(0, MAX_RENDER_SERIES) ?? [];

  const baseSeries = effectiveSeries.filter((s) => !s.label.includes('(forecast)'));

  // Decide split between "large" and "small" series by comparing maximum values.
  const seriesMax = baseSeries.map((s) => ({
    label: s.label,
    max: Math.max(...s.points.map((p) => p.value), 0),
  }));

  const overallMax = Math.max(...seriesMax.map((s) => s.max), 0);
  const largeThreshold = overallMax * 0.25; // top ~25% of scale are "large" series

  const largeSeries = seriesMax.filter((s) => s.max >= largeThreshold).map((s) => s.label);
  const smallSeries = seriesMax.filter((s) => s.max < largeThreshold).map((s) => s.label);

  const showDualAxisButton = largeSeries.length > 0 && smallSeries.length > 0;

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

  React.useEffect(() => {
    if (!query.data) return;

    const responseGeoCodes = new Set(query.data.availableGeos?.map((g) => g.code));
    const missing = geoValues.filter((geo) => !responseGeoCodes.has(geo));

    setMissingGeos(missing);
  }, [query.data, geoValues]);

  React.useEffect(() => {
    // Clear any chart-level error whenever the underlying query changes.
    setChartError(null);
  }, [query.data, query.error]);

const activeFilterLabels = useMemo(() => {
    if (!query.data) return [];
    return Object.entries(dimensionFilters)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => findDimensionValueLabel(availableDimensions, key, value));
  }, [availableDimensions, dimensionFilters, query.data]);

  const MAX_SERIES_TO_RENDER = 16;

  const chartOption = useMemo(() => {
    if (!query.data) {
      return undefined;
    }
    if (query.data.series.length === 0) {
      return undefined;
    }

    try {
      // debug: print period/series info when showing induced abortions
      if (topicId === 'induced-abortions') {
        // eslint-disable-next-line no-console
        console.log(
          'DEBUG induced:',
          query.data.periods,
          effectiveSeries.map((s) => ({ label: s.label, points: s.points.slice(-3) })),
        );
      }

    // years appear even if one of the series has no observation for them.
    const xAxis = query.data.periods;

    // Only count non-forecast series when deciding if dual axes should be enabled.
    const twoSeries = showDualAxisButton;

    const baseColors = new Map<string, string>([
      ['Estonia', '#00e676'],
      ['Estonia — Total', '#00e676'],
      ['Estonia — Males', '#a855f7'],
      ['Estonia — Females', '#facc15'],
      ['European Union - 27 countries (from 2020)', '#4c9aff'],
    ]);

    const normalizeSeriesLabel = (label: string) => {
      const est = /Estonia/i.test(label);
      if (!est) return label;

      // Only normalise to the canonical "Total" label when the series is clearly
      // the overall total (or contains no further segmentation beyond Estonia).
      if (/\bTotal\b/i.test(label) || /^Estonia\s*$/i.test(label)) return 'Estonia — Total';

      // Keep sex-series canonical so they always map to the same colour.
      if (/\bMales?\b/i.test(label)) return 'Estonia — Males';
      if (/\bFemales?\b/i.test(label)) return 'Estonia — Females';

      // Otherwise preserve the full label so different age / cohort groups get distinct colours.
      return label;
    };

    const palette = ['#00e676', '#4c9aff', '#f97316', '#a855f7', '#facc15', '#ec4899', '#22c55e', '#38bdf8', '#f43f5e'];
    const colorMap = new Map<string, string>(baseColors);

    // Ensure all base series (excluding forecast versions) have distinct colors.
    const usedColors = new Set<string>(colorMap.values());
    let nextPaletteIndex = 0;
    effectiveSeries
      .map((s) => normalizeSeriesLabel(s.label.replace(/ \(forecast\)$/, '')))
      .filter((label, index, arr) => arr.indexOf(label) === index)
      .forEach((baseLabel) => {
        if (!colorMap.has(baseLabel)) {
          // Find next palette color that isn't already in use.
          while (usedColors.has(palette[nextPaletteIndex % palette.length])) {
            nextPaletteIndex += 1;
          }
          const color = palette[nextPaletteIndex % palette.length];
          usedColors.add(color);
          colorMap.set(baseLabel, color);
          nextPaletteIndex += 1;
        }
      });

    // If everything ended up the same colour (which can happen if all series
    // share the same normalized label), force a more distinct palette.
    // This helps avoid situations where the chart looks like a single colour
    // even though there are multiple series.
    const distinctColorCount = new Set(colorMap.values()).size;
    const uniqueLabels = effectiveSeries
      .map((s) => normalizeSeriesLabel(s.label.replace(/ \(forecast\)$/, '')))
      .filter((label, index, arr) => arr.indexOf(label) === index);

    if (distinctColorCount === 1 && uniqueLabels.length > 1) {
      uniqueLabels.forEach((label, idx) => {
        const color = palette[idx % palette.length];
        colorMap.set(label, color);
      });
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('All series were assigned the same colour; overriding with palette for distinct series.');
      }
    }

    // Debug: log label -> color mapping when colors look wrong.
    if (process.env.NODE_ENV === 'development' && topicId === 'yth_demo_070') {
      // eslint-disable-next-line no-console
      console.log('colorMap entries', Array.from(colorMap.entries()));
      // eslint-disable-next-line no-console
      console.log(
        'series color lookup',
        effectiveSeries.map((s) => {
          const normalized = normalizeSeriesLabel(s.label.replace(/ \(forecast\)$/, ''));
          return { label: s.label, normalized, color: colorMap.get(normalized) };
        }),
      );
    }

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
      data: baseSeries.map((s) => normalizeSeriesLabel(s.label)),
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

    option.series = effectiveSeries.map((series) => {
      const isForecast = series.label.includes('(forecast)');
      const normalizedLabel = normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, ''));
      const isLarge = largeSeries.includes(normalizedLabel);
      const yAxisIndex = twoSeries && dualAxis ? (isLarge ? 1 : 0) : 0;
      const seriesColor = colorMap.get(normalizedLabel) ?? '#4c9aff';

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('Chart option build failed:', err);
    setChartError(message);
    return undefined;
  }
  }, [query.data, topic.chartVariant, dualAxis, showDualAxisButton, activeFilterLabels]);

  const latestValues = useMemo(() => {
    if (!query.data) {
      return [];
    }

    const filterSuffix = activeFilterLabels.length > 0 ? ` (${activeFilterLabels.join(', ')})` : '';

    return effectiveSeries
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

          {query.data?.forecastDisabledReason ? (
            <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <strong className="font-semibold">No reliable forecast:</strong> {query.data.forecastDisabledReason}
            </div>
          ) : null}

          {query.data?.warning ? (
            <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <strong className="font-semibold">Notice:</strong> {query.data.warning}
            </div>
          ) : null}

          {missingGeos.length > 0 ? (
            <div className="mt-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <strong className="font-semibold">No data for:</strong>{' '}
              {missingGeos
                .map((code) => KNOWN_GEOS.find((g) => g.code === code)?.label ?? code)
                .join(', ')}
            </div>
          ) : null}

          {chartError ? (
            <div className="mt-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <strong className="font-semibold">Rendering error:</strong> {chartError}
            </div>
          ) : null}

          <div className="mt-2 flex flex-col gap-2 text-sm text-slate-400">
            <span>Compare geos:</span>
            <div className="flex flex-wrap items-center gap-2">
              {geoValues.map((geo) => (
                <span
                  key={geo}
                  className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs"
                >
                  {geo}
                  <button
                    type="button"
                    onClick={() => setGeoValues((prev) => prev.filter((g) => g !== geo))}
                    className="rounded-full bg-white/20 px-1 text-xs"
                  >
                    ×
                  </button>
                </span>
              ))}
              <div className="relative">
                <input
                  value={geoInput}
                  onChange={(e) => setGeoInput(e.target.value.toUpperCase())}
                  placeholder="Add geo (e.g. DE)"
                  className="h-9 w-40 rounded-2xl border border-border bg-slate-950/80 px-3 text-xs text-white outline-none transition focus:border-sky-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const value = geoInput.trim().toUpperCase();
                      if (value && !geoValues.includes(value)) {
                        setGeoValues((prev) => [...prev, value]);
                      }
                      setGeoInput('');
                    }
                  }}
                />
                {geoInput ? (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-border bg-slate-950/90">
                    {KNOWN_GEOS
                      .filter((g) => g.code.startsWith(geoInput) || g.label.toLowerCase().includes(geoInput.toLowerCase()))
                      .slice(0, 10)
                      .map((g) => (
                        <button
                          key={g.code}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-xs text-white hover:bg-white/10"
                          onClick={() => {
                            if (!geoValues.includes(g.code)) {
                              if (topicId === 'yth_demo_070') {
                                // yth_demo_070 is too heavy to request multiple countries simultaneously.
                                setGeoValues([g.code]);
                              } else {
                                setGeoValues((prev) => [...prev, g.code]);
                              }
                            }
                            setGeoInput('');
                          }}
                        >
                          {g.code} — {g.label}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

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

        {(query.data?.series?.length ?? 0) > MAX_SERIES_TO_RENDER ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <strong className="font-semibold">Showing first {MAX_SERIES_TO_RENDER} series.</strong>{' '}
            Reduce the number of selected countries or split dimensions to improve performance.
          </div>
        ) : null}
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

      {query.data && query.data.series.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">
          <div className="text-lg font-semibold">No data is available for the selected filters.</div>
          <p className="max-w-2xl text-sm leading-6 text-rose-100/90">
            {query.data.warning ?? 'Try changing the selected countries, time range, or dimension filters.'}
          </p>
        </div>
      ) : query.data && chartOption ? (
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
