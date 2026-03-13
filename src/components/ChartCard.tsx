import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { fetchTopicData } from '../lib/eurostat';
import { TOPIC_MAP } from '../features/dashboard/topicCatalog';
import type { DataSeries } from '../features/dashboard/types';

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
  const topic = TOPIC_MAP[topicId];

  if (!topic) {
    return null;
  }
  const query = useQuery({
    queryKey: ['topic-data', topicId],
    queryFn: () => fetchTopicData(topicId),
  });

  // toggle to enable dual‑axis plotting when there are two series; users can
  // switch it on/off via a button in the card header.  Defaults to off so that
  // the existing behaviour remains unless the user explicitly enables it.
  const [dualAxis, setDualAxis] = React.useState(false);

  const baseSeries = query.data?.series.filter((s) => !s.label.includes('(forecast)')) ?? [];
  const showDualAxisButton = baseSeries.length === 2;

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

    const option: any = {
      animationDuration: 400,
      backgroundColor: 'transparent',
    };

    option.tooltip = {
      trigger: 'axis',
      valueFormatter: (value: number) => formatValue(value, query.data.decimals, query.data.unitSuffix),
    };
    option.legend = {
      top: 0,
      textStyle: {
        color: '#cbd5e1',
      },
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
    option.yAxis = twoSeries && dualAxis
      ? [
          {
            type: 'value',
            axisLabel: { color: '#94a3b8' },
            splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
          },
          {
            type: 'value',
            axisLabel: { color: '#94a3b8' },
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
      const seriesColor = baseColors.get(baseLabel) ?? '#4c9aff';

      return {
        name: series.label,
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
  }, [query.data, topic.chartVariant, dualAxis, showDualAxisButton]);

  const latestValues = useMemo(() => {
    if (!query.data) {
      return [];
    }

    return query.data.series
      .filter((series) => !series.label.includes('(forecast)'))
      .map((series) => ({
        label: series.label,
        point: series.points.at(-1),
      }))
      .filter(
        (entry): entry is { label: string; point: DataSeries['points'][number] } => Boolean(entry.point),
      );
  }, [query.data]);

  return (
    <article className="flex min-h-[30rem] flex-col rounded-3xl border border-border bg-slate-900/80 p-5 shadow-card backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{topic.datasetCode}</div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">{topic.title}</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">{topic.description}</p>
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
