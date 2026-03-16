import type { DataSeries, TopicData, TopicDefinition } from '../../features/dashboard/types';
import type { EChartsOption } from 'echarts';
import { formatValue } from './helpers';

type BuildChartOptionArgs = {
  topicId: string;
  topic: TopicDefinition;
  data: TopicData;
  effectiveSeries: DataSeries[];
  baseSeries: DataSeries[];
  largeSeries: string[];
  dualAxis: boolean;
  showDualAxisButton: boolean;
  activeFilterLabels: string[];
};

export function buildChartOption({
  topicId,
  topic,
  data,
  effectiveSeries,
  baseSeries,
  largeSeries,
  dualAxis,
  showDualAxisButton,
  activeFilterLabels,
}: BuildChartOptionArgs): EChartsOption {
  const xAxis = data.periods;
  const twoSeries = showDualAxisButton;

  const baseColors = new Map<string, string>([
    ['Estonia', '#00e676'],
    ['Estonia - Total', '#00e676'],
    ['Estonia - Males', '#a855f7'],
    ['Estonia - Females', '#facc15'],
    ['European Union - 27 countries (from 2020)', '#4c9aff'],
  ]);

  const normalizeSeriesLabel = (label: string) => {
    const estonia = /Estonia/i.test(label);
    if (!estonia) return label;

    if (/\bTotal\b/i.test(label) || /^Estonia\s*$/i.test(label)) return 'Estonia - Total';
    if (/\bMales?\b/i.test(label)) return 'Estonia - Males';
    if (/\bFemales?\b/i.test(label)) return 'Estonia - Females';

    return label;
  };

  const palette = ['#00e676', '#4c9aff', '#f97316', '#a855f7', '#facc15', '#ec4899', '#22c55e', '#38bdf8', '#f43f5e'];
  const colorMap = new Map<string, string>(baseColors);

  const usedColors = new Set<string>(colorMap.values());
  let nextPaletteIndex = 0;
  effectiveSeries
    .map((series) => normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, '')))
    .filter((label, index, arr) => arr.indexOf(label) === index)
    .forEach((baseLabel) => {
      if (!colorMap.has(baseLabel)) {
        while (usedColors.has(palette[nextPaletteIndex % palette.length])) {
          nextPaletteIndex += 1;
        }
        const color = palette[nextPaletteIndex % palette.length];
        usedColors.add(color);
        colorMap.set(baseLabel, color);
        nextPaletteIndex += 1;
      }
    });

  const distinctColorCount = new Set(colorMap.values()).size;
  const uniqueLabels = effectiveSeries
    .map((series) => normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, '')))
    .filter((label, index, arr) => arr.indexOf(label) === index);

  if (distinctColorCount === 1 && uniqueLabels.length > 1) {
    uniqueLabels.forEach((label, index) => {
      const color = palette[index % palette.length];
      colorMap.set(label, color);
    });
    if (process.env.NODE_ENV === 'development') {
      console.warn('All series were assigned the same color; overriding with palette for distinct series.');
    }
  }

  if (process.env.NODE_ENV === 'development' && topicId === 'yth_demo_070') {
    console.log('colorMap entries', Array.from(colorMap.entries()));
    console.log(
      'series color lookup',
      effectiveSeries.map((series) => {
        const normalized = normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, ''));
        return { label: series.label, normalized, color: colorMap.get(normalized) };
      }),
    );
  }

  if (topicId === 'induced-abortions') {
    console.log(
      'DEBUG induced:',
      data.periods,
      effectiveSeries.map((series) => ({ label: series.label, points: series.points.slice(-3) })),
    );
  }

  const filterSuffix = activeFilterLabels.length > 0 ? ` (${activeFilterLabels.join(', ')})` : '';

  const axisColors = baseSeries.map((series) => {
    const baseLabel = normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, ''));
    return colorMap.get(baseLabel) ?? '#4c9aff';
  });

  return {
    animationDuration: 400,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const entries = Array.isArray(params) ? params : [params];
        const lines: string[] = [];
        entries.forEach((entry) => {
          if (!entry || typeof entry !== 'object') return;

          const seriesName = 'seriesName' in entry && typeof entry.seriesName === 'string'
            ? entry.seriesName
            : '';
          const marker = 'marker' in entry && typeof entry.marker === 'string' ? entry.marker : '';
          const rawValue =
            'value' in entry && (typeof entry.value === 'number' || entry.value === null)
              ? entry.value
              : null;

          if (!seriesName.includes('(forecast)')) {
            const value =
              rawValue == null
                ? 'n/a'
                : formatValue(rawValue, data.decimals, data.unitSuffix);
            lines.push(`${marker} ${seriesName}: ${value}`);
          }
        });
        return lines.join('<br/>');
      },
    },
    legend: {
      top: 0,
      textStyle: {
        color: '#cbd5e1',
      },
      data: baseSeries.map((series) => normalizeSeriesLabel(series.label)),
      inactiveColor: '#999999',
    },
    grid: {
      left: 16,
      right: 16,
      top: 56,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
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
    },
    yAxis:
      twoSeries && dualAxis
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
          },
    series: effectiveSeries.map((series) => {
      const isForecast = series.label.includes('(forecast)');
      const normalizedLabel = normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, ''));
      const isLarge = largeSeries.includes(normalizedLabel) || largeSeries.includes(series.label);
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
    }),
  };
}
