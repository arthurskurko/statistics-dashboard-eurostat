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
  const { series, periods } = parseSeries(dataset, topic.title);

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
