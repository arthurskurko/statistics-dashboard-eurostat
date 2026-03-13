import { TOPIC_MAP } from '../features/dashboard/topicCatalog';
import type { DataPoint, DataSeries, TopicData } from '../features/dashboard/types';

type JsonStatCategory = {
  index: string[] | Record<string, number>;
  label?: Record<string, string>;
};

type JsonStatDimension = {
  category: JsonStatCategory;
};

type JsonStatDataset = {
  id: string[];
  size: number[];
  value: number[] | Record<string, number | null>;
  label?: string;
  dimension: Record<string, JsonStatDimension>;
};

type DimensionInfo = {
  id: string;
  codes: string[];
  labels: Record<string, string>;
};

const EUROSTAT_BASE =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

function buildUrlForTopic(topic: { datasetCode: string; filters: Record<string, string | string[]>; geoValues?: string[] }): string {
  const url = new URL(`${EUROSTAT_BASE}/${topic.datasetCode}`);
  url.searchParams.set('lang', 'en');

  for (const [key, value] of Object.entries(topic.filters)) {
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      url.searchParams.append(key, entry);
    }
  }

  for (const geo of topic.geoValues ?? []) {
    url.searchParams.append('geo', geo);
  }

  return url.toString();
}

function getDimensionInfo(dataset: JsonStatDataset): DimensionInfo[] {
  return dataset.id.map((dimensionId) => {
    const category = dataset.dimension[dimensionId]?.category;

    if (!category) {
      throw new Error(`Missing category metadata for dimension: ${dimensionId}`);
    }

    const codes = Array.isArray(category.index)
      ? category.index
      : Object.entries(category.index)
          .sort((first, second) => first[1] - second[1])
          .map(([code]) => code);

    return {
      id: dimensionId,
      codes,
      labels: category.label ?? {},
    };
  });
}

function unravelIndex(flatIndex: number, sizes: number[]): number[] {
  const positions = new Array(sizes.length).fill(0);
  let remainder = flatIndex;

  for (let index = sizes.length - 1; index >= 0; index -= 1) {
    const size = sizes[index];
    positions[index] = remainder % size;
    remainder = Math.floor(remainder / size);
  }

  return positions;
}

function inferSortKey(periodCode: string): number {
  const annual = /^(\d{4})$/;
  const monthly = /^(\d{4})M(\d{2})$/;
  const quarterly = /^(\d{4})-?Q(\d)$/i;
  const halfYear = /^(\d{4})-?[HS](\d)$/i;

  if (annual.test(periodCode)) {
    return Number(periodCode) * 100;
  }

  const monthlyMatch = periodCode.match(monthly);
  if (monthlyMatch) {
    return Number(monthlyMatch[1]) * 100 + Number(monthlyMatch[2]);
  }

  const quarterlyMatch = periodCode.match(quarterly);
  if (quarterlyMatch) {
    return Number(quarterlyMatch[1]) * 100 + Number(quarterlyMatch[2]) * 3;
  }

  const halfYearMatch = periodCode.match(halfYear);
  if (halfYearMatch) {
    return Number(halfYearMatch[1]) * 100 + Number(halfYearMatch[2]) * 6;
  }

  return Number(periodCode.replace(/\D/g, '')) || 0;
}

function formatPeriodLabel(periodCode: string): string {
  const monthlyMatch = periodCode.match(/^(\d{4})M(\d{2})$/);
  if (monthlyMatch) {
    return `${monthlyMatch[1]}-${monthlyMatch[2]}`;
  }

  const halfYearMatch = periodCode.match(/^(\d{4})S(\d)$/i);
  if (halfYearMatch) {
    return `${halfYearMatch[1]} H${halfYearMatch[2]}`;
  }

  const quarterlyMatch = periodCode.match(/^(\d{4})-?Q(\d)$/i);
  if (quarterlyMatch) {
    return `${quarterlyMatch[1]} Q${quarterlyMatch[2]}`;
  }

  return periodCode;
}

function getNextPeriodCode(periodCode: string): string | null {
  const annual = /^\d{4}$/;
  const monthly = /^(\d{4})M(\d{2})$/;
  const quarterly = /^(\d{4})-?Q(\d)$/i;
  const halfYear = /^(\d{4})S(\d)$/i;

  if (annual.test(periodCode)) {
    return String(Number(periodCode) + 1);
  }

  const monthlyMatch = periodCode.match(monthly);
  if (monthlyMatch) {
    const year = Number(monthlyMatch[1]);
    const month = Number(monthlyMatch[2]);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}M${String(nextMonth).padStart(2, '0')}`;
  }

  const quarterlyMatch = periodCode.match(quarterly);
  if (quarterlyMatch) {
    const year = Number(quarterlyMatch[1]);
    const quarter = Number(quarterlyMatch[2]);
    const nextQuarter = quarter === 4 ? 1 : quarter + 1;
    const nextYear = quarter === 4 ? year + 1 : year;
    return `${nextYear}Q${nextQuarter}`;
  }

  const halfYearMatch = periodCode.match(halfYear);
  if (halfYearMatch) {
    const year = Number(halfYearMatch[1]);
    const half = Number(halfYearMatch[2]);
    const nextHalf = half === 2 ? 1 : 2;
    const nextYear = half === 2 ? year + 1 : year;
    return `${nextYear}S${nextHalf}`;
  }

  return null;
}

// List of current EU‑27 coding values used for synthesised aggregates.
// These match the geo codes supplied in the DEMO_FABORTORD dimension above.
const EU27_CODES = [
  'BE','BG','CZ','DK','DE','EE','IE','ES','FR','HR','IT','CY','LV','LT','LU',
  'HU','MT','NL','AT','PL','PT','RO','SI','SK','FI','SE',
];


function parseSeries(dataset: JsonStatDataset, fallbackLabel: string): { series: DataSeries[]; periods: string[] } {
  const dimensions = getDimensionInfo(dataset);
  const timeDimension = dimensions.find((dimension) => /time/i.test(dimension.id)) ?? dimensions.at(-1);
  const geoDimension = dimensions.find((dimension) => dimension.id.toLowerCase() === 'geo');

  if (!timeDimension) {
    throw new Error('Eurostat response did not include a time dimension.');
  }

  const timeDimensionIndex = dimensions.findIndex((dimension) => dimension.id === timeDimension.id);
  const geoDimensionIndex = geoDimension
    ? dimensions.findIndex((dimension) => dimension.id === geoDimension.id)
    : -1;

  // always expose all period codes, sorted by inferred sort key
  let periods = [...timeDimension.codes]
    .map((code) => ({ code, sortKey: inferSortKey(code) }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((entry) => formatPeriodLabel(entry.code));

  const values = Array.isArray(dataset.value)
    ? dataset.value.map((value, index) => [index, value] as const)
    : Object.entries(dataset.value).map(([index, value]) => [Number(index), value] as const);

  const seriesMap = new Map<string, DataPoint[]>();

  for (const [flatIndex, rawValue] of values) {
    if (rawValue === null || rawValue === undefined || Number.isNaN(Number(rawValue))) {
      continue;
    }

    const positions = unravelIndex(flatIndex, dataset.size);
    const periodCode = timeDimension.codes[positions[timeDimensionIndex]];
    const geoCode = geoDimension ? geoDimension.codes[positions[geoDimensionIndex]] : fallbackLabel;
    const geoLabel = geoDimension?.labels[geoCode] ?? fallbackLabel;

    const point: DataPoint = {
      periodCode,
      label: formatPeriodLabel(periodCode),
      sortKey: inferSortKey(periodCode),
      value: Number(rawValue),
    };

    const existing = seriesMap.get(geoLabel) ?? [];
    existing.push(point);
    seriesMap.set(geoLabel, existing);
  }

  const series = [...seriesMap.entries()]
    .map(([label, points]) => ({
      id: label,
      label,
      points: points.sort((first, second) => first.sortKey - second.sortKey),
    }))
    .filter((series) => series.points.length > 0);

  // Drop trailing time periods that have no data points for any series. Eurostat
  // sometimes publishes a time label (e.g. next year) without any values yet.
  const allPointSortKeys = series.flatMap((s) => s.points.map((p) => p.sortKey));
  if (allPointSortKeys.length > 0) {
    const maxSortKey = Math.max(...allPointSortKeys);
    periods = periods.filter((p) => inferSortKey(p) <= maxSortKey);
  }

  // Some datasets (notably EU aggregates) can show a partially-reported new year
  // with a value far below the previous year. Treat these as incomplete and drop
  // them so they don't anchor the “latest” value or ruin the forecast.
  for (const s of series) {
    if (!/european union|eu27/i.test(s.label)) continue;
    while (s.points.length > 1) {
      const last = s.points[s.points.length - 1];
      const prev = s.points[s.points.length - 2];
      if (last.value === 0) {
        s.points.pop();
        continue;
      }
      // If the final point is dramatically smaller than the prior year, assume it
      // is a partial reporting artifact rather than a real drop.
      if (last.value < prev.value * 0.35) {
        s.points.pop();
        continue;
      }
      break;
    }
  }

  return { series, periods };
}

/**
 * Build an aggregate series summing the specified geo codes from a full dataset.
 */
function buildAggregate(dataset: JsonStatDataset, includeCodes: string[], label: string): DataSeries {
  const dimensions = getDimensionInfo(dataset);
  const timeDimension = dimensions.find((d) => /time/i.test(d.id)) ?? dimensions.at(-1);
  const geoDimension = dimensions.find((d) => d.id.toLowerCase() === 'geo');
  if (!timeDimension || !geoDimension) {
    throw new Error('Cannot build aggregate without time and geo dimensions');
  }

  const timeIndex = dimensions.findIndex((d) => d.id === timeDimension.id);
  const geoIndex = dimensions.findIndex((d) => d.id === geoDimension.id);

  const periods = [...timeDimension.codes];

  // Keep track of how many countries contributed to each period so that we can
  // detect partial / incomplete years (where only a few countries have reported).
  const points: Array<{
    periodCode: string;
    label: string;
    sortKey: number;
    value: number;
    count: number;
  }> = periods.map((code) => ({
    periodCode: code,
    label: formatPeriodLabel(code),
    sortKey: inferSortKey(code),
    value: 0,
    count: 0,
  }));

  const values = Array.isArray(dataset.value)
    ? dataset.value.map((v, i) => [i, v] as const)
    : Object.entries(dataset.value).map(([i, v]) => [Number(i), v] as const);

  for (const [flatIndex, rawValue] of values) {
    if (rawValue == null || Number.isNaN(Number(rawValue))) continue;
    const pos = unravelIndex(flatIndex, dataset.size);
    const geoCode = geoDimension.codes[pos[geoIndex]];
    if (!includeCodes.includes(geoCode)) continue;
    const periodCode = timeDimension.codes[pos[timeIndex]];
    const pt = points.find((p) => p.periodCode === periodCode);
    if (pt) {
      pt.value += Number(rawValue);
      pt.count += 1;
    }
  }

  // Drop trailing years that are clearly incomplete (few countries reported).
  const maxCount = Math.max(...points.map((p) => p.count));
  const minAcceptableCount = Math.max(1, Math.floor(maxCount * 0.7));
  let lastValid = points.length - 1;
  while (lastValid >= 0 && points[lastValid].count < minAcceptableCount) {
    lastValid -= 1;
  }

  const trimmed = points.slice(0, lastValid + 1);

  return {
    id: label,
    label,
    points: trimmed
      .filter((p) => p.count > 0)
      .map(({ count, ...p }) => p),
  };
}
export async function fetchTopicData(topicId: string, options?: { forecastHorizon?: number }): Promise<TopicData> {
  let topic = TOPIC_MAP[topicId];
  const forecastHorizon = options?.forecastHorizon ?? 20;

  if (!topic) {
    // Allow fetching by dataset code directly (custom topics).
    topic = {
      id: topicId,
      title: topicId,
      description: `Eurostat dataset ${topicId}`,
      datasetCode: topicId,
      filters: {},
      geoValues: ['EE', 'EU27_2020'],
      decimals: 0,
      sourceUrl: `https://ec.europa.eu/eurostat/databrowser/view/${topicId}/default/table?lang=en`,
    };
  }

  const url = buildUrlForTopic(topic);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Eurostat request failed with status ${response.status}.`);
  }

  const dataset = (await response.json()) as JsonStatDataset;
  let { series, periods } = parseSeries(dataset, topic.title);

  // Trim trailing zero values (often used as a placeholder for missing future data).
  for (const s of series) {
    while (s.points.length > 0 && s.points[s.points.length - 1].value === 0) {
      s.points.pop();
    }
  }

  // Sometimes the dataset includes a partial new year (e.g., 2024) where only a few
  // countries have reported. Treat these as incomplete series, so they don't
  // become the "latest" value or anchor the forecast.
  const trimIncomplete = (s: DataSeries) => {
    if (!/european union|eu27/i.test(s.label)) return;

    while (s.points.length > 1) {
      const last = s.points[s.points.length - 1];
      const prev = s.points[s.points.length - 2];
      if (last.value === 0 || last.value < prev.value * 0.35) {
        s.points.pop();
        continue;
      }
      break;
    }
  };

  for (const s of series) {
    trimIncomplete(s);
  }

  // Align x-axis periods with the last available point across all series.
  const maxSortKey = Math.max(...series.flatMap((s) => s.points.map((p) => p.sortKey)));
  periods = periods.filter((p) => inferSortKey(p) <= maxSortKey);

  // if the topic requests the EU27 aggregate but the response didn't include it
  // (e.g. many health tables only publish individual countries), fetch the
  // full dataset without a geo filter and build a synthetic EU series.
  if (
    topic.geoValues?.includes('EU27_2020') &&
    (() => {
      const idx = dataset.dimension.geo?.category.index;
      if (!idx) return false;
      return Array.isArray(idx) ? !idx.includes('EU27_2020') : idx['EU27_2020'] === undefined;
    })()
  ) {
    // ask again without geo restrictions to get all countries
    const fullUrl = new URL(`${EUROSTAT_BASE}/${topic.datasetCode}`);
    fullUrl.searchParams.set('lang', 'en');
    for (const [key, value] of Object.entries(topic.filters)) {
      const values = Array.isArray(value) ? value : [value];
      for (const entry of values) {
        fullUrl.searchParams.append(key, entry);
      }
    }

    const fullResponse = await fetch(fullUrl.toString());
    if (!fullResponse.ok) {
      throw new Error(`Eurostat request failed with status ${fullResponse.status}.`);
    }
    const fullDataset = (await fullResponse.json()) as JsonStatDataset;
    const fullResult = parseSeries(fullDataset, topic.title);

    // compute aggregate over EU27 member codes
    const euAggregate = buildAggregate(fullDataset, EU27_CODES, 'European Union - 27 countries (from 2020)');
    series = fullResult.series.filter((s) => s.id === topic.title || s.id === 'Estonia');
    // ensure Estonia is included if requested
    if (!series.find((s) => s.label === 'Estonia')) {
      const est = fullResult.series.find((s) => s.label === 'Estonia');
      if (est) series.push(est);
    }
    series.push(euAggregate);
    periods = fullResult.periods;

    // Trim any trailing incomplete years from series (especially in the EU aggregate).
    // Eurostat sometimes publishes a new year label before most countries have reported.
    for (const s of series) {
      while (s.points.length > 0 && s.points[s.points.length - 1].value === 0) {
        s.points.pop();
      }

      if (/european union|eu27/i.test(s.label)) {
        while (s.points.length > 1) {
          const last = s.points[s.points.length - 1];
          const prev = s.points[s.points.length - 2];
          if (last.value === 0 || last.value < prev.value * 0.35) {
            s.points.pop();
            continue;
          }
          break;
        }
      }
    }

    // Ensure the x-axis periods do not include years beyond the last available point.
    const maxSortKey = Math.max(...series.flatMap((s) => s.points.map((p) => p.sortKey)));
    periods = periods.filter((p) => inferSortKey(p) <= maxSortKey);
  }


  const baseSeries = series.filter((s) => !s.label.includes('(forecast)'));

  // Try to load precomputed forecasts from /public/forecasts/<dataset>.json (Python/R output).
  let precomputedForecast: number[] | null = null;
  try {
    const resp = await fetch(`/forecasts/${topic.datasetCode}.json`);
    if (resp.ok) {
      const fc = (await resp.json()) as { forecast?: number[] };
      if (Array.isArray(fc.forecast) && fc.forecast.length > 0) {
        precomputedForecast = fc.forecast;
        // eslint-disable-next-line no-console
        console.log('Using precomputed forecast for', topicId, 'len', precomputedForecast.length);
      }
    }
  } catch {
    // ignore and fall back to computed forecast
  }

  if (!precomputedForecast) {
    // eslint-disable-next-line no-console
    console.log('No precomputed forecast; using built-in extrapolation for', topicId);
  }

  // Forecast function: estimate future values from recent year-on-year ratios.
  // This avoids huge spikes/drops when the last two points are anomalous.
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const computeForecast = (points: { periodCode: string; value: number }[]) => {
    if (points.length < 2) return Array(forecastHorizon).fill(points[points.length - 1]?.value ?? 0);

    // Use a longer window to reduce the impact of short-term spikes/drops.
    const recent = points.slice(-8); // use up to last 8 points to smooth
    const ratios: number[] = [];
    for (let i = 1; i < recent.length; i += 1) {
      const prev = recent[i - 1].value;
      const curr = recent[i].value;
      if (prev > 0) ratios.push(curr / prev);
    }

    // Use the median year-on-year ratio and dampen it toward 1 to avoid extreme extrapolations.
    const rawRatio = median(ratios.length ? ratios : [1]);
    const ratio = 1 + (clamp(rawRatio, 0.7, 1.1) - 1) * 0.5;

    const lastValue = recent[recent.length - 1].value;
    const rawForecast = Array.from({ length: forecastHorizon }, (_, idx) => lastValue * ratio ** (idx + 1));

    // Smoothly ramp from the last observed value into the forecast so the
    // predicted line doesn't jump abruptly when the first forecast point is
    // materially different.
    const rampYears = Math.min(3, forecastHorizon);
    return rawForecast.map((val, idx) => {
      if (idx >= rampYears) return val;
      const t = (idx + 1) / (rampYears + 1);
      return lastValue + (val - lastValue) * t;
    });
  };

  // Create a forecast series for each real (non-forecast) series.
  for (const base of baseSeries) {
    const lastPoint = base.points[base.points.length - 1];
    if (!lastPoint) continue;

    const years: string[] = [];
    let nextCode = getNextPeriodCode(lastPoint.periodCode);
    for (let i = 0; i < forecastHorizon; i += 1) {
      if (!nextCode) break;
      years.push(nextCode);
      nextCode = getNextPeriodCode(nextCode);
    }

    const yearLabels = years.map((year) => formatPeriodLabel(year));
    for (const label of yearLabels) {
      if (!periods.includes(label)) periods.push(label);
    }

    // Keep the period list sorted and unique.
    periods = Array.from(new Set(periods)).sort((a, b) => inferSortKey(a) - inferSortKey(b));

    const isEu = (label: string) =>
      label.toLowerCase().includes('european union') || label.toLowerCase().includes('eu27');

    let forecastValues: number[];
    const basePoints = base.points.map((p) => ({ periodCode: p.periodCode, value: p.value }));

    if (isEu(base.label) && precomputedForecast && precomputedForecast.length > 0) {
      // apply precomputed forecast only to EU series
      forecastValues = precomputedForecast.slice(0, years.length);

      // If the precomputed forecast collapses quickly (often due to a short-term data dip),
      // fall back to the built-in extrapolation so we don't show a misleading 0/near-zero trend.
      const lastReal = basePoints[basePoints.length - 1]?.value ?? 0;
      const firstForecast = forecastValues[0] ?? 0;
      const dangerouslyLow = firstForecast <= 0 || firstForecast < lastReal * 0.35;
      const containsZero = forecastValues.some((v) => v <= 0);
      if (dangerouslyLow || containsZero) {
        // eslint-disable-next-line no-console
        console.log('Ignoring precomputed forecast for', topicId, 'because it collapses; using built-in extrapolation instead');
        forecastValues = computeForecast(basePoints);
      }
    } else {
      forecastValues = computeForecast(basePoints);
    }

    // Ensure we always have enough forecast points; if precomputed data is shorter
    // than the requested horizon, pad with the last available value.
    if (forecastValues.length < years.length) {
      const lastVal = forecastValues[forecastValues.length - 1] ?? lastPoint.value;
      forecastValues = [...forecastValues, ...Array(years.length - forecastValues.length).fill(lastVal)];
    }

    const points = [
      { ...lastPoint, predicted: true },
      ...years.map((year, idx) => ({
        periodCode: year,
        label: yearLabels[idx],
        sortKey: inferSortKey(year),
        value: forecastValues[idx],
        predicted: true,
      })),
    ].sort((a, b) => a.sortKey - b.sortKey);

    series.push({
      id: `${base.id}-forecast`,
      label: `${base.label} (forecast)`,
      points,
    });
  }

  if (series.length === 0) {
    // include the request URL to aid debugging if the dataset structure changes
    throw new Error(
      `Eurostat returned no observations for this topic (url: ${url}). ` +
        'This can happen if the dataset filters are out of date or the API is unavailable.',
    );
  }

  // debug: show final state for induced abortions (should include forecast year)
  if (topicId === 'induced-abortions' || topicId === 'inflation') {
    // eslint-disable-next-line no-console
    console.log('DEBUG fetchTopicData final', {
      topicId,
      periods,
      series: series.map((s) => ({
        label: s.label,
        lastPoint: s.points.at(-1),
        length: s.points.length,
        lastThree: s.points.slice(-3),
      })),
    });

    // Log which series are considered forecast series
    // eslint-disable-next-line no-console
    console.log('DEBUG forecast-series', series.filter((s) => s.label.includes('(forecast)')).map((s) => s.label));
  }

  return {
    title: topic.title,
    subtitle: topic.description,
    unitSuffix: topic.unitSuffix,
    decimals: topic.decimals ?? 0,
    sourceUrl: topic.sourceUrl,
    series,
    periods,
  };
}
