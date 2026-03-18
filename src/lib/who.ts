import { WHO_TOPIC_MAP } from '../features/dashboard/whoTopicCatalog';
import type { DataPoint, DataSeries, TopicData, TopicDefinition } from '../features/dashboard/types';

type WhoApiResponse<T> = {
  value?: T[];
  '@odata.nextLink'?: string;
};

type WhoCountry = {
  Code: string;
  Title: string;
  Dimension?: string;
};

type WhoIndicator = {
  IndicatorCode: string;
  IndicatorName: string;
};

type WhoDataRow = {
  IndicatorCode?: string;
  SpatialDim?: string;
  SpatialDimType?: string;
  TimeDim?: number | string;
  TimeDimensionValue?: string;
  NumericValue?: number | null;
  Value?: string | null;
  Dim1?: string | null;
  Dim2?: string | null;
  Dim3?: string | null;
};

const WHO_PROXY_BASE = '/api/who/api';
const WHO_REMOTE_BASE = 'https://ghoapi.azureedge.net/api';
const WHO_COUNTRIES_STORAGE_KEY = 'who-countries-cache.v1';

function createWhoUrl(path: string): URL {
  return new URL(path, window.location.origin);
}

function toProxiedWhoUrl(url: string): string {
  if (url.startsWith(WHO_REMOTE_BASE)) {
    return `${WHO_PROXY_BASE}${url.slice(WHO_REMOTE_BASE.length)}`;
  }

  if (url.startsWith('/api/')) {
    return `/api/who${url}`;
  }

  return url;
}

function inferSortKey(periodCode: string): number {
  return Number(periodCode.replace(/\D/g, '')) || 0;
}

function getNextPeriodCode(periodCode: string): string | null {
  if (!/^\d{4}$/.test(periodCode)) return null;
  return String(Number(periodCode) + 1);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 1;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeForecast(points: DataPoint[], horizon: number): number[] {
  if (points.length < 2) {
    return Array(horizon).fill(points[points.length - 1]?.value ?? 0);
  }

  const recent = points.slice(-8);
  const ratios: number[] = [];
  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1].value;
    const current = recent[index].value;
    if (previous > 0) ratios.push(current / previous);
  }

  const rawRatio = median(ratios);
  const dampedRatio = 1 + (clamp(rawRatio, 0.7, 1.1) - 1) * 0.5;
  const lastValue = recent[recent.length - 1].value;

  return Array.from({ length: horizon }, (_, index) => lastValue * dampedRatio ** (index + 1));
}

async function fetchWhoAllPages<T>(url: URL): Promise<T[]> {
  let nextUrl: string | null = url.toString();
  const rows: T[] = [];

  while (nextUrl) {
    const response = await fetch(toProxiedWhoUrl(nextUrl));
    if (!response.ok) {
      throw new Error(`WHO request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as WhoApiResponse<T>;
    rows.push(...(payload.value ?? []));
    nextUrl = payload['@odata.nextLink'] ? toProxiedWhoUrl(payload['@odata.nextLink']) : null;
  }

  return rows;
}

async function fetchWhoCountries(): Promise<Array<{ code: string; label: string }>> {
  try {
    const cached = window.localStorage.getItem(WHO_COUNTRIES_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Array<{ code: string; label: string }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore cache parse issues
  }

  const url = createWhoUrl(`${WHO_PROXY_BASE}/DIMENSION/COUNTRY/DimensionValues`);
  url.searchParams.set('$format', 'json');
  url.searchParams.set('$top', '1000');

  const countryRows = await fetchWhoAllPages<WhoCountry>(url);
  const countries = countryRows
    .map((country) => ({ code: String(country.Code).toUpperCase(), label: country.Title }))
    .filter((country) => country.code && country.label)
    .sort((a, b) => a.label.localeCompare(b.label));

  const withEuropeRegion = [{ code: 'EUR', label: 'Europe region' }, ...countries];

  try {
    window.localStorage.setItem(WHO_COUNTRIES_STORAGE_KEY, JSON.stringify(withEuropeRegion));
  } catch {
    // ignore storage errors
  }

  return withEuropeRegion;
}

function toTopicDefinitionFromCode(indicatorCode: string): TopicDefinition {
  return {
    id: indicatorCode,
    title: indicatorCode,
    description: `WHO indicator ${indicatorCode}`,
    datasetCode: indicatorCode,
    filters: {},
    geoValues: ['EST', 'EUR'],
    decimals: 2,
    chartVariant: 'line',
    sourceUrl: `${WHO_REMOTE_BASE}/${indicatorCode}`,
    pubmed: {
      availability: 'unchecked',
      searchTerm: indicatorCode,
      note: 'Added from WHO indicator code. Curate PubMed mapping if this topic is kept.',
    },
  };
}

function buildGeoFilter(geoValues: string[]): string {
  if (geoValues.length === 1) {
    return `SpatialDim eq '${geoValues[0]}'`;
  }
  return `(${geoValues.map((geo) => `SpatialDim eq '${geo}'`).join(' or ')})`;
}

function parseWhoNumericValue(row: WhoDataRow): number | null {
  if (typeof row.NumericValue === 'number' && Number.isFinite(row.NumericValue)) {
    return row.NumericValue;
  }

  if (typeof row.Value === 'string') {
    const parsed = Number(row.Value.replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function buildSeriesKey(row: WhoDataRow): string {
  const spatial = (row.SpatialDim ?? '').toUpperCase().trim();
  if (spatial) return spatial;

  const dimValues = [row.Dim1, row.Dim2, row.Dim3]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);

  if (dimValues.length > 0) {
    return `DIM:${dimValues.join('|')}`;
  }

  return row.SpatialDimType ? String(row.SpatialDimType).toUpperCase() : 'GLOBAL';
}

function scoreRow(row: WhoDataRow): number {
  let score = 0;
  if (row.Dim1 == null) score += 4;
  if (row.Dim2 == null) score += 2;
  if (row.Dim3 == null) score += 1;
  if (typeof row.Dim1 === 'string' && /BTSX|TOTAL|ALL/i.test(row.Dim1)) score += 3;
  return score;
}

function pickCanonicalRows(rows: WhoDataRow[]): WhoDataRow[] {
  const bySeriesPeriod = new Map<string, WhoDataRow>();

  for (const row of rows) {
    const periodCode = String(row.TimeDim ?? row.TimeDimensionValue ?? '');
    if (!periodCode) continue;

    const seriesKey = buildSeriesKey(row);
    if (!seriesKey) continue;

    const key = `${seriesKey}__${periodCode}`;
    const existing = bySeriesPeriod.get(key);
    if (!existing || scoreRow(row) > scoreRow(existing)) {
      bySeriesPeriod.set(key, row);
    }
  }

  return [...bySeriesPeriod.values()];
}

function mapRowsToSeries(rows: WhoDataRow[]): { series: DataSeries[]; periods: string[] } {
  const canonicalRows = pickCanonicalRows(rows);
  const seriesMap = new Map<string, DataPoint[]>();
  const periods = new Set<string>();

  for (const row of canonicalRows) {
    const value = parseWhoNumericValue(row);
    if (value === null) continue;

    const geo = buildSeriesKey(row);
    const periodCode = String(row.TimeDim ?? row.TimeDimensionValue ?? '');
    if (!geo || !periodCode) continue;

    periods.add(periodCode);

    const point: DataPoint = {
      periodCode,
      label: periodCode,
      sortKey: inferSortKey(periodCode),
      value,
    };

    const points = seriesMap.get(geo) ?? [];
    points.push(point);
    seriesMap.set(geo, points);
  }

  const series = [...seriesMap.entries()]
    .map(([label, points]) => ({
      id: label,
      label,
      points: points.sort((a, b) => a.sortKey - b.sortKey),
    }))
    .filter((entry) => entry.points.length > 0);

  const orderedPeriods = [...periods].sort((a, b) => inferSortKey(a) - inferSortKey(b));
  return { series, periods: orderedPeriods };
}

function pickFallbackGeos(rows: WhoDataRow[], preferredGeos: string[], maxGeos = 2): string[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const geo = (row.SpatialDim ?? '').toUpperCase().trim();
    if (!geo) continue;
    counts.set(geo, (counts.get(geo) ?? 0) + 1);
  }

  if (counts.size === 0) return [];

  const selected: string[] = [];
  for (const geo of preferredGeos.map((entry) => entry.toUpperCase())) {
    if (!counts.has(geo)) continue;
    if (selected.includes(geo)) continue;
    selected.push(geo);
    if (selected.length >= maxGeos) return selected;
  }

  const byCoverage = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([geo]) => geo);

  for (const geo of byCoverage) {
    if (selected.includes(geo)) continue;
    selected.push(geo);
    if (selected.length >= maxGeos) break;
  }

  return selected;
}

async function fetchIndicatorName(indicatorCode: string): Promise<string | null> {
  const url = createWhoUrl(`${WHO_PROXY_BASE}/Indicator`);
  url.searchParams.set('$format', 'json');
  url.searchParams.set('$top', '1');
  url.searchParams.set('$filter', `IndicatorCode eq '${indicatorCode}'`);

  const rows = await fetchWhoAllPages<WhoIndicator>(url);
  return rows[0]?.IndicatorName ?? null;
}

export async function fetchWhoTopicData(
  topicId: string,
  options?: {
    forecastHorizon?: number;
    filters?: Record<string, string | string[]>;
    seriesDimension?: string;
    geoValues?: string[];
  },
): Promise<TopicData> {
  const forecastHorizon = options?.forecastHorizon ?? 20;
  const topic = WHO_TOPIC_MAP[topicId] ?? toTopicDefinitionFromCode(topicId);
  const indicatorCode = topic.datasetCode;
  const geoValues = (options?.geoValues?.length ? options.geoValues : topic.geoValues) ?? ['EST', 'EUR'];

  const countries = await fetchWhoCountries();
  const numericFilter = 'NumericValue ne null';

  const url = createWhoUrl(`${WHO_PROXY_BASE}/${indicatorCode}`);
  url.searchParams.set('$format', 'json');
  url.searchParams.set('$top', '1000');
  url.searchParams.set('$filter', `${buildGeoFilter(geoValues)} and ${numericFilter}`);

  const rows = await fetchWhoAllPages<WhoDataRow>(url);
  let { series, periods } = mapRowsToSeries(rows);
  let warningNote: string | undefined;

  if (series.length === 0) {
    const fallbackUrl = createWhoUrl(`${WHO_PROXY_BASE}/${indicatorCode}`);
    fallbackUrl.searchParams.set('$format', 'json');
    fallbackUrl.searchParams.set('$top', '1000');
    fallbackUrl.searchParams.set('$filter', numericFilter);

    const fallbackRows = await fetchWhoAllPages<WhoDataRow>(fallbackUrl);
    const fallbackGeos = pickFallbackGeos(fallbackRows, geoValues, 2);

    if (fallbackGeos.length > 0) {
      const narrowedRows = fallbackRows.filter((row) => fallbackGeos.includes((row.SpatialDim ?? '').toUpperCase()));
      const narrowed = mapRowsToSeries(narrowedRows);
      series = narrowed.series;
      periods = narrowed.periods;

      if (series.length > 0) {
        warningNote = `Selected geographies (${geoValues.join(', ')}) had no data; showing ${fallbackGeos.join(', ')} instead.`;
      }
    }

    if (series.length === 0) {
      const generic = mapRowsToSeries(fallbackRows);
      series = generic.series;
      periods = generic.periods;
    }
  }

  const indicatorName = (await fetchIndicatorName(indicatorCode)) ?? topic.title;

  if (series.length === 0) {
    return {
      title: indicatorName,
      subtitle: topic.description,
      decimals: topic.decimals ?? 2,
      unitSuffix: topic.unitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: countries,
      warning:
        'No WHO observations were returned for this indicator and selected geographies. Try another geography or indicator code.',
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

    const futurePeriods: string[] = [];
    let nextPeriod = getNextPeriodCode(lastPoint.periodCode);
    for (let index = 0; index < forecastHorizon; index += 1) {
      if (!nextPeriod) break;
      futurePeriods.push(nextPeriod);
      nextPeriod = getNextPeriodCode(nextPeriod);
    }

    if (futurePeriods.length === 0) continue;

    const forecastValues = computeForecast(base.points, futurePeriods.length);

    for (const periodCode of futurePeriods) {
      if (!periods.includes(periodCode)) periods.push(periodCode);
    }

    const predictedPoints: DataPoint[] = [
      { ...lastPoint, predicted: true },
      ...futurePeriods.map((periodCode, index) => ({
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
    title: indicatorName,
    subtitle: topic.description,
    decimals: topic.decimals ?? 2,
    unitSuffix: topic.unitSuffix,
    sourceUrl: topic.sourceUrl,
    series: [...series, ...forecastSeries],
    periods,
    availableGeos: countries,
    forecastDisabledReason,
    warning: warningNote,
  };
}
