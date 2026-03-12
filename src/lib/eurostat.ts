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

function buildUrl(topicId: string): string {
  const topic = TOPIC_MAP[topicId];

  if (!topic) {
    throw new Error(`Unknown topic: ${topicId}`);
  }

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

  return periodCode;
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
  const periods = [...timeDimension.codes]
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
  const points: DataPoint[] = periods.map((code) => ({
    periodCode: code,
    label: formatPeriodLabel(code),
    sortKey: inferSortKey(code),
    value: 0,
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
    if (pt) pt.value += Number(rawValue);
  }

  return { id: label, label, points: points.filter((p) => p.value !== 0) };
}
export async function fetchTopicData(topicId: string): Promise<TopicData> {
  const topic = TOPIC_MAP[topicId];

  if (!topic) {
    throw new Error(`Unknown topic: ${topicId}`);
  }

  const url = buildUrl(topicId);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Eurostat request failed with status ${response.status}.`);
  }

  const dataset = (await response.json()) as JsonStatDataset;
  let { series, periods } = parseSeries(dataset, topic.title);

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
  }

  // after we have final series/periods (including any synthetic EU) append
  // predictions from precomputed JSON files.
  try {
    const url = `/forecasts/${topic.datasetCode}.json`;
    const resp = await fetch(url);

    if (!resp.ok) {
      console.warn('forecast fetch not ok', url, resp.status);
    } else {
      const contentType = resp.headers.get('content-type') || '';
      if (!/application\/json/.test(contentType)) {
        console.warn('forecast endpoint did not return JSON, ignoring', url, contentType);
      } else {
        // read the body once as text
        const text = await resp.text();
        let fc: any | undefined;
        try {
          fc = JSON.parse(text);
        } catch (parseErr) {
          console.error('forecast JSON parse failed', url, parseErr, 'body:', text.substring(0, 200));
          fc = undefined;
        }

        if (fc && Array.isArray(fc.forecast) && fc.forecast.length > 0) {
          const lastYear = periods.length ? Number(periods[periods.length - 1]) : NaN;
          if (!Number.isNaN(lastYear)) {
            const nextYear = String(lastYear + 1);
            periods = [...periods, nextYear];
            const euSeries = series.find((s) => s.label.includes('European Union'));
            if (euSeries) {
              euSeries.points.push({
                periodCode: nextYear,
                label: nextYear,
                sortKey: inferSortKey(nextYear),
                value: Number(fc.forecast[0]),
                predicted: true,
              });
            } else {
              console.warn('no EU series to append forecast to', series.map((s) => s.label));
            }
          }
        } else {
          console.warn('forecast file missing data or empty', url);
        }
      }
    }
  } catch (err) {
    console.error('error fetching forecast', err);
  }

  // forecast missing tail values for any series using a pre‑computed file
  for (const s of series) {
    const missing = periods.filter((p) => !s.points.some((pt) => pt.periodCode === p));
    if (missing.length === 0) continue;
    const lastReal = s.points.reduce((a, b) => (a.sortKey > b.sortKey ? a : b));
    const tail = periods.filter((p) => inferSortKey(p) > lastReal.sortKey);
    if (tail.length !== missing.length) continue;

    // try loading forecast JSON generated by `npm run generate-forecasts`
    try {
      const resp = await fetch(`/forecasts/${topic.datasetCode}.json`);
      if (resp.ok) {
        const file = await resp.json();
        const preds: number[] = file.forecast ?? [];
        preds.forEach((val, i) => {
          s.points.push({
            periodCode: missing[i],
            label: missing[i],
            sortKey: inferSortKey(missing[i]),
            value: val,
            predicted: true,
          });
        });
        s.points.sort((a, b) => a.sortKey - b.sortKey);
      }
    } catch {
      // ignore, just leave gaps
    }
  }

  
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
  }

  if (series.length === 0) {
    // include the request URL to aid debugging if the dataset structure changes
    throw new Error(
      `Eurostat returned no observations for this topic (url: ${url}). ` +
        'This can happen if the dataset filters are out of date or the API is unavailable.',
    );
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
