import type { DataSeries, TopicData, TopicDefinition } from '../../features/dashboard/types';
import type { EChartsOption } from 'echarts';

// ECharts doesn't export AxisNameTextStyleOption directly; we only need the `rich` subset.
type AxisNameTextStyleOption = { rich?: Record<string, unknown> };
import { formatValue } from './helpers';

type BuildChartOptionArgs = {
  topic: TopicDefinition;
  data: TopicData;
  effectiveSeries: DataSeries[];
  baseSeries: DataSeries[];
  largeSeries: string[];
  dualAxis: boolean;
  showDualAxisButton: boolean;
  activeFilterLabels: string[];
  compactMobileLayout?: boolean;
  currentMusicStep?: {
    step: number;
    points: Array<{ seriesLabel: string; label: string; value: number }>;
  } | null;
};

export function buildChartOption({
  topic,
  data,
  effectiveSeries,
  baseSeries,
  largeSeries,
  dualAxis,
  showDualAxisButton,
  activeFilterLabels,
  compactMobileLayout = false,
  currentMusicStep,
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

  const filterSuffix = activeFilterLabels.length > 0 ? ` (${activeFilterLabels.slice(0, 3).join(', ')}${activeFilterLabels.length > 3 ? ', …' : ''})` : '';

  const truncate = (value: string, max = 40) =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;

  const formatAxisValue = (value: number): string => {
    const compactNumber = (scaled: number): string => {
      const roundedInt = Math.round(scaled);
      if (Math.abs(scaled - roundedInt) < 0.05) {
        return `${roundedInt}`;
      }
      return scaled.toFixed(1).replace(/\.0$/, '');
    };

    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) {
      return `${compactNumber(value / 1_000_000_000)}G`;
    }
    if (abs >= 1_000_000) {
      return `${compactNumber(value / 1_000_000)}M`;
    }
    if (abs >= 1_000) {
      return `${compactNumber(value / 1_000)}k`;
    }
    return value.toString();
  };

  const seriesWithAxis = effectiveSeries.map((series) => {
    const isForecast = series.label.includes('(forecast)');
    const normalizedLabel = normalizeSeriesLabel(series.label.replace(/ \(forecast\)$/, ''));
    const isLarge = largeSeries.includes(normalizedLabel) || largeSeries.includes(series.label);
    const yAxisIndex = twoSeries && dualAxis ? (isLarge ? 1 : 0) : 0;
    const seriesColor = colorMap.get(normalizedLabel) ?? '#4c9aff';

    return {
      baseSeries: series,
      yAxisIndex,
      seriesColor,
      isForecast,
      normalizedLabel,
    };
  });

  const highlightPointBySeries = new Map<string, { label: string; value: number }>();
  if (currentMusicStep?.points) {
    currentMusicStep.points.forEach((point) => {
      highlightPointBySeries.set(point.seriesLabel, {
        label: point.label,
        value: point.value,
      });
    });
  }

  const seriesByAxis = seriesWithAxis.reduce<Record<number, string[]>>((acc, item) => {
    acc[item.yAxisIndex] = acc[item.yAxisIndex] ?? [];
    if (!acc[item.yAxisIndex].includes(item.seriesColor)) {
      acc[item.yAxisIndex].push(item.seriesColor);
    }
    return acc;
  }, {});

  const axisName = (axisIndex: number, label: string) => {
    const colors = seriesByAxis[axisIndex] ?? [];
    if (colors.length === 0) return label;

    const chunkSize = 3;
    const rows: string[] = [];
    for (let i = 0; i < colors.length; i += chunkSize) {
      const rowDots = colors
        .slice(i, i + chunkSize)
        .map((_, idx) => `{dot_${axisIndex}_${i + idx}|●}`)
        .join('');
      rows.push(rowDots);
    }

    const formatted = `\n${rows.join('\n')}`;
    return `${label}${formatted}`;
  };

  const axisNameTextStyle = (axisIndex: number): AxisNameTextStyleOption => {
    const colors = seriesByAxis[axisIndex] ?? [];
    const rich: Record<string, unknown> = {
      dot: { fontSize: compactMobileLayout ? 11 : 14 },
    };

    colors.forEach((color, idx) => {
      rich[`dot_${axisIndex}_${idx}`] = { color };
    });

    return { rich } as unknown as AxisNameTextStyleOption;
  };

  const smallSeriesColor = seriesByAxis[0]?.[0] ?? '#4c9aff';
  const largeSeriesColor = seriesByAxis[1]?.[0] ?? '#f97316';
  const totalRenderedPoints = seriesWithAxis.length * xAxis.length;
  const useLightweightRendering = totalRenderedPoints > 300;
  const disableAnimation = compactMobileLayout || totalRenderedPoints > 120;
  const axisLabelFontSize = compactMobileLayout ? 10 : 12;
  const legendFontSize = compactMobileLayout ? 9 : 10;
  const axisNameSmallLabel = compactMobileLayout ? 'Small' : 'Small values';
  const axisNameLargeLabel = compactMobileLayout ? 'Large' : 'Large values';

  return {
    animation: !disableAnimation,
    animationDuration: disableAnimation ? 0 : 250,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      textStyle: {
        fontSize: 11,
        lineHeight: 18,
      },
      formatter: (params: unknown) => {
        const entries = Array.isArray(params) ? params : [params];
        const lines: string[] = [];

        const extractValue = (entry: Record<string, unknown>): number | null => {
          const value = entry.value;
          if (typeof value === 'number') return value;
          if (Array.isArray(value) && typeof value[1] === 'number') return value[1];

          const dataValue = entry.data;
          if (typeof dataValue === 'number') return dataValue;
          if (dataValue && typeof dataValue === 'object' && 'value' in dataValue) {
            const nestedValue = (dataValue as Record<string, unknown>).value;
            if (typeof nestedValue === 'number') return nestedValue;
          }
          return null;
        };

        entries.forEach((entry) => {
          if (!entry || typeof entry !== 'object') return;

          const seriesName = typeof entry.seriesName === 'string' ? entry.seriesName : '';
          const marker = typeof entry.marker === 'string' ? entry.marker : '';
          const rawValue = extractValue(entry);

          const displayName = truncate(seriesName.replace(/ \(forecast\)$/, ''));
          const isForecast = seriesName.includes('(forecast)');

          if (rawValue == null) return; // skip empty series points (avoids redundant n/a entries)
          const value = formatValue(rawValue, data.decimals, data.unitSuffix);
          lines.push(`${marker} ${displayName}: ${value}${isForecast ? ' (forecast)' : ''}`);
        });

        return lines.join('<br/>');
      },
    },
    legend: {
      top: 0,
      textStyle: {
        color: '#cbd5e1',
        fontSize: legendFontSize,
      },
      itemWidth: compactMobileLayout ? 14 : 18,
      itemHeight: compactMobileLayout ? 8 : 10,
      itemGap: compactMobileLayout ? 10 : 18,
      tooltip: {
        show: true,
      },
      formatter: (name: string) => {
        const maxLen = compactMobileLayout ? 22 : 30;
        if (name.length <= maxLen) return name;
        return `${name.slice(0, maxLen)}…`;
      },
      data: baseSeries.map((series) => `${series.label}${filterSuffix}`),
      inactiveColor: '#999999',
    },
    grid: {
      left: compactMobileLayout ? 8 : 16,
      right: compactMobileLayout ? 8 : 16,
      top: compactMobileLayout ? 50 : 56,
      bottom: compactMobileLayout ? 4 : 8,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: xAxis,
      axisLabel: {
        color: '#94a3b8',
        fontSize: axisLabelFontSize,
        hideOverlap: true,
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
              name: axisName(0, axisNameSmallLabel),
              nameGap: compactMobileLayout ? 12 : 18,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              nameTextStyle: axisNameTextStyle(0) as any,
              axisLabel: {
                color: smallSeriesColor,
                fontSize: axisLabelFontSize,
                margin: compactMobileLayout ? 6 : 8,
                formatter: (value: number) => formatAxisValue(Number(value)),
              },
              axisLine: { lineStyle: { color: smallSeriesColor } },
              splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
            },
            {
              type: 'value',
              name: axisName(1, axisNameLargeLabel),
              nameGap: compactMobileLayout ? 12 : 18,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              nameTextStyle: axisNameTextStyle(1) as any,
              axisLabel: {
                color: largeSeriesColor,
                fontSize: axisLabelFontSize,
                margin: compactMobileLayout ? 6 : 8,
                formatter: (value: number) => formatAxisValue(Number(value)),
              },
              axisLine: { lineStyle: { color: largeSeriesColor } },
              splitLine: { show: false },
            },
          ]
        : {
            type: 'value',
            axisLabel: {
              color: '#94a3b8',
              fontSize: axisLabelFontSize,
              formatter: (value: number) => formatAxisValue(Number(value)),
            },
            splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
          },
    series: (seriesWithAxis.map(({ baseSeries, yAxisIndex, seriesColor, isForecast }) => {
      // Convert point lookup from O(n) find-per-label to O(1) map lookup.
      // This significantly reduces render cost when many series are shown.
      const pointValueByLabel = new Map(baseSeries.points.map((point) => [point.label, point.value]));
      const hasSinglePoint = baseSeries.points.length <= 1;

      return {
        name: `${baseSeries.label}${filterSuffix}`,
        type: topic.chartVariant ?? 'line',
        smooth: !useLightweightRendering,
        // With exactly one observation there is no line segment; keep a marker visible.
        showSymbol: hasSinglePoint,
        symbolSize: hasSinglePoint ? 9 : 6,
        emphasis: { focus: 'series' },
        areaStyle: !useLightweightRendering && !isForecast ? { opacity: 0.12 } : undefined,
        yAxisIndex,
        data: xAxis.map((label) => pointValueByLabel.get(label) ?? null),
        itemStyle: {
          color: seriesColor,
        },
        markPoint: (() => {
          const highlight = highlightPointBySeries.get(baseSeries.label);
          if (!highlight) return undefined;
          return {
            data: [
              {
                coord: [highlight.label, highlight.value],
                symbol: 'circle',
                symbolSize: compactMobileLayout ? 10 : 12,
                itemStyle: {
                  color: '#ffffff',
                  borderColor: seriesColor,
                  borderWidth: 2,
                },
              },
            ],
          };
        })(),
        lineStyle: {
          width: useLightweightRendering ? (compactMobileLayout ? 1.5 : 2) : (compactMobileLayout ? 2 : 3),
          type: isForecast ? 'dashed' : 'solid',
          color: seriesColor,
        },
        sampling: useLightweightRendering ? 'lttb' : undefined,
        progressive: useLightweightRendering ? 500 : 0,
        progressiveThreshold: useLightweightRendering ? 1000 : undefined,
      };
    }) as any),
  };
}
