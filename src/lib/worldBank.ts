import { WORLD_BANK_TOPIC_MAP } from '../features/dashboard/worldBankTopicCatalog';
import type { DataPoint, DataSeries, TopicData, TopicDefinition } from '../features/dashboard/types';

type WorldBankCountry = {
  id: string;
  iso2Code?: string;
  name: string;
};

type WorldBankIndicator = {
  id: string;
  value: string;
};

type WorldBankDataRow = {
  indicator: WorldBankIndicator;
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
  unit?: string;
  decimal?: number;
};

type WorldBankMeta = {
  page: number;
  pages: number;
};

const WORLD_BANK_BASE = 'https://api.worldbank.org/v2';
const COUNTRIES_STORAGE_KEY = 'worldbank-countries-cache.v1';

function inferSortKey(periodCode: string): number {
  const annual = /^(\d{4})$/;
  const monthly = /^(\d{4})M(\d{2})$/;
  const quarterly = /^(\d{4})Q(\d)$/i;

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

  return Number(periodCode.replace(/\D/g, '')) || 0;
}

async function fetchAllPages<T>(url: URL): Promise<T[]> {
  const firstResponse = await fetch(url.toString());
  if (!firstResponse.ok) {
    throw new Error(`World Bank request failed with status ${firstResponse.status}.`);
  }

  const firstPayload = (await firstResponse.json()) as [WorldBankMeta, T[]];
  const firstMeta = firstPayload?.[0];
  const firstRows = firstPayload?.[1] ?? [];

  const allRows = [...firstRows];
  const totalPages = Number(firstMeta?.pages ?? 1);

  for (let page = 2; page <= totalPages; page += 1) {
    const paged = new URL(url.toString());
    paged.searchParams.set('page', String(page));

    const response = await fetch(paged.toString());
    if (!response.ok) {
      throw new Error(`World Bank request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as [WorldBankMeta, T[]];
    const rows = payload?.[1] ?? [];
    allRows.push(...rows);
  }

  return allRows;
}

async function fetchWorldBankCountries(): Promise<Array<{ code: string; label: string }>> {
  try {
    const cached = window.localStorage.getItem(COUNTRIES_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Array<{ code: string; label: string }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore malformed cache
  }

  const url = new URL(`${WORLD_BANK_BASE}/country`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', '400');

  const rows = await fetchAllPages<WorldBankCountry>(url);
  const countries = rows
    .map((country) => ({ code: country.id.toUpperCase(), label: country.name }))
    .filter((country) => country.code && country.label)
    .sort((a, b) => a.label.localeCompare(b.label));

  try {
    window.localStorage.setItem(COUNTRIES_STORAGE_KEY, JSON.stringify(countries));
  } catch {
    // ignore storage failures
  }

  return countries;
}

function toTopicDefinitionFromCode(indicatorCode: string): TopicDefinition {
  return {
    id: indicatorCode,
    title: indicatorCode,
    description: `World Bank indicator ${indicatorCode}`,
    datasetCode: indicatorCode,
    filters: {},
    geoValues: ['EST', 'EUU'],
    decimals: 2,
    chartVariant: 'line',
    sourceUrl: `https://data.worldbank.org/indicator/${indicatorCode}`,
  };
}

function mapRowsToSeries(rows: WorldBankDataRow[]): { series: DataSeries[]; periods: string[] } {
  const seriesMap = new Map<string, DataPoint[]>();
  const periodSet = new Set<string>();

  for (const row of rows) {
    if (row.value == null || Number.isNaN(Number(row.value))) continue;

    const periodCode = String(row.date);
    periodSet.add(periodCode);

    const label = row.country?.value ?? row.countryiso3code ?? row.country?.id ?? 'Unknown';
    const point: DataPoint = {
      periodCode,
      label: periodCode,
      sortKey: inferSortKey(periodCode),
      value: Number(row.value),
    };

    const points = seriesMap.get(label) ?? [];
    points.push(point);
    seriesMap.set(label, points);
  }

  const series = [...seriesMap.entries()]
    .map(([label, points]) => ({
      id: label,
      label,
      points: points
        .sort((a, b) => a.sortKey - b.sortKey)
        .filter((point, index, arr) => {
          if (index === 0) return true;
          return arr[index - 1].periodCode !== point.periodCode;
        }),
    }))
    .filter((entry) => entry.points.length > 0);

  const periods = [...periodSet].sort((a, b) => inferSortKey(a) - inferSortKey(b));
  return { series, periods };
}

export async function fetchWorldBankTopicData(
  topicId: string,
  options?: {
    forecastHorizon?: number;
    filters?: Record<string, string | string[]>;
    seriesDimension?: string;
    geoValues?: string[];
  },
): Promise<TopicData> {
  const topic = WORLD_BANK_TOPIC_MAP[topicId] ?? toTopicDefinitionFromCode(topicId);
  const indicatorCode = topic.datasetCode;
  const geoValues = (options?.geoValues?.length ? options.geoValues : topic.geoValues) ?? ['EST', 'EUU'];

  const countries = await fetchWorldBankCountries();
  const countryPath = geoValues.map((geo) => geo.toLowerCase()).join(';');

  const url = new URL(`${WORLD_BANK_BASE}/country/${countryPath}/indicator/${indicatorCode}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', '20000');

  const rows = await fetchAllPages<WorldBankDataRow>(url);
  const nonNullRows = rows.filter((row) => row.value != null);
  const { series, periods } = mapRowsToSeries(nonNullRows);

  const indicatorTitle = rows[0]?.indicator?.value?.trim() || topic.title;
  const unit = rows.find((row) => row.unit && row.unit.trim())?.unit?.trim();
  const decimal = rows.find((row) => typeof row.decimal === 'number')?.decimal;

  if (series.length === 0) {
    return {
      title: indicatorTitle,
      subtitle: topic.description,
      decimals: typeof decimal === 'number' ? decimal : topic.decimals ?? 2,
      unitSuffix: topic.unitSuffix ?? unit,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: countries,
      warning:
        'No observations were returned for this indicator and the selected countries. Try another country or indicator.',
    };
  }

  return {
    title: indicatorTitle,
    subtitle: topic.description,
    decimals: typeof decimal === 'number' ? decimal : topic.decimals ?? 2,
    unitSuffix: topic.unitSuffix ?? unit,
    sourceUrl: topic.sourceUrl,
    series,
    periods,
    availableGeos: countries,
  };
}
