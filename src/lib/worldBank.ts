import { WORLD_BANK_TOPIC_MAP } from '../features/dashboard/worldBankTopicCatalog';
import type { DataPoint, DataSeries, TopicData, TopicDefinition } from '../features/dashboard/types';
import { clamp, getNextPeriodCode, inferSortKey, median } from './timeSeries';

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
const WORLD_BANK_MAX_GEO_VALUES = 6;
const WORLD_BANK_MAX_SERIES = 28;
const WORLD_BANK_MAX_PERIODS = 900;
const WORLD_BANK_MAX_TOTAL_POINTS = 8000;

function computeForecast(
  points: DataPoint[],
  horizon: number,
  bounds?: { min?: number; max?: number },
): number[] {
  if (points.length < 2) {
    return Array(horizon).fill(points[points.length - 1]?.value ?? 0);
  }

  const recent = points.slice(-10);
  const values = recent.map((point) => point.value);
  const deltas: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    deltas.push(values[index] - values[index - 1]);
  }

  const longRunLevel = median(values);
  let level = values[values.length - 1];
  let delta = median(deltas);

  return Array.from({ length: horizon }, () => {
    // Blend a decaying trend with mean reversion toward recent central tendency.
    const reversion = (longRunLevel - level) * 0.18;
    delta = delta * 0.72 + reversion;
    level += delta;

    if (bounds) {
      const min = bounds.min ?? Number.NEGATIVE_INFINITY;
      const max = bounds.max ?? Number.POSITIVE_INFINITY;
      level = clamp(level, min, max);
    }

    return level;
  });
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

export async function fetchWorldBankCountries(): Promise<Array<{ code: string; label: string }>> {
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
    pubmed: {
      availability: 'unchecked',
      searchTerm: indicatorCode,
      note: 'Added from indicator code. Curate PubMed mapping if this topic is kept.',
    },
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
  const forecastHorizon = options?.forecastHorizon ?? 20;
  const topic = WORLD_BANK_TOPIC_MAP[topicId] ?? toTopicDefinitionFromCode(topicId);
  const indicatorCode = topic.datasetCode;
  const geoValues = (options?.geoValues?.length ? options.geoValues : topic.geoValues) ?? ['EST', 'EUU'];

  const countries = await fetchWorldBankCountries();

  if (geoValues.length > WORLD_BANK_MAX_GEO_VALUES) {
    return {
      title: topic.title,
      subtitle: topic.description,
      decimals: topic.decimals ?? 2,
      unitSuffix: topic.unitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: countries,
      warning: `Too many geographies selected (${geoValues.length}). Please select up to ${WORLD_BANK_MAX_GEO_VALUES} geographies.`,
    };
  }

  const countryPath = geoValues.map((geo) => geo.toLowerCase()).join(';');

  const url = new URL(`${WORLD_BANK_BASE}/country/${countryPath}/indicator/${indicatorCode}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', '20000');

  const rows = await fetchAllPages<WorldBankDataRow>(url);
  const nonNullRows = rows.filter((row) => row.value != null);
  const { series, periods } = mapRowsToSeries(nonNullRows);
  const totalPointCount = series.reduce((sum, entry) => sum + entry.points.length, 0);

  const indicatorTitle = rows[0]?.indicator?.value?.trim() || topic.title;
  const unit = rows.find((row) => row.unit && row.unit.trim())?.unit?.trim();
  const decimal = rows.find((row) => typeof row.decimal === 'number')?.decimal;
  const resolvedUnitSuffix = topic.unitSuffix ?? unit;

  if (series.length === 0) {
    return {
      title: indicatorTitle,
      subtitle: topic.description,
      decimals: typeof decimal === 'number' ? decimal : topic.decimals ?? 2,
      unitSuffix: resolvedUnitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: countries,
      warning:
        'No observations were returned for this indicator and the selected countries. Try another country or indicator.',
    };
  }

  if (
    series.length > WORLD_BANK_MAX_SERIES ||
    periods.length > WORLD_BANK_MAX_PERIODS ||
    totalPointCount > WORLD_BANK_MAX_TOTAL_POINTS
  ) {
    return {
      title: indicatorTitle,
      subtitle: topic.description,
      decimals: typeof decimal === 'number' ? decimal : topic.decimals ?? 2,
      unitSuffix: resolvedUnitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: countries,
      warning:
        `Dataset too large to process safely (series: ${series.length}, periods: ${periods.length}, points: ${totalPointCount}). ` +
        'Reduce geographies or choose a smaller indicator.',
    };
  }

  const baseSeries = series.filter((entry) => !entry.label.includes('(forecast)'));
  const forecastSeries: DataSeries[] = [];
  const skippedForecastSeries: string[] = [];

  for (const base of baseSeries) {
    if (base.points.length < 3) {
      skippedForecastSeries.push(base.label);
      continue;
    }

    const lastPoint = base.points[base.points.length - 1];
    if (!lastPoint) continue;

    const periodCodes: string[] = [];
    let nextPeriod = getNextPeriodCode(lastPoint.periodCode);
    for (let index = 0; index < forecastHorizon; index += 1) {
      if (!nextPeriod) break;
      periodCodes.push(nextPeriod);
      nextPeriod = getNextPeriodCode(nextPeriod);
    }

    if (periodCodes.length === 0) continue;

    const bounds = resolvedUnitSuffix === '%' ? { min: 0, max: 100 } : undefined;
    const forecastValues = computeForecast(base.points, periodCodes.length, bounds);
    for (const periodCode of periodCodes) {
      if (!periods.includes(periodCode)) periods.push(periodCode);
    }

    const predictedPoints: DataPoint[] = [
      { ...lastPoint, predicted: true },
      ...periodCodes.map((periodCode, index) => ({
        periodCode,
        label: periodCode,
        sortKey: inferSortKey(periodCode),
        value: forecastValues[index],
        predicted: true,
      })),
    ];

    forecastSeries.push({
      id: `${base.id}-forecast`,
      label: `${base.label} (forecast)`,
      points: predictedPoints,
    });
  }

  periods.sort((a, b) => inferSortKey(a) - inferSortKey(b));

  const forecastDisabledReason =
    skippedForecastSeries.length > 0
      ? `Forecast skipped for ${skippedForecastSeries.join(', ')} (not enough historical points).`
      : undefined;

  return {
    title: indicatorTitle,
    subtitle: topic.description,
    decimals: typeof decimal === 'number' ? decimal : topic.decimals ?? 2,
    unitSuffix: resolvedUnitSuffix,
    sourceUrl: topic.sourceUrl,
    series: [...series, ...forecastSeries],
    periods,
    availableGeos: countries,
    forecastDisabledReason,
  };
}
