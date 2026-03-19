import { WHO_TOPIC_MAP } from '../features/dashboard/whoTopicCatalog';
import type { DataPoint, DataSeries, TopicData, TopicDefinition } from '../features/dashboard/types';
import { clamp, getNextPeriodCode, inferSortKey, median } from './timeSeries';

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

type WhoSnapshotIndex = {
  generatedAt?: string;
  countries?: Array<{ code: string; label: string }>;
  indicators?: Array<{ code: string; title: string; rowCount?: number }>;
};

type WhoSnapshotData = {
  code: string;
  title?: string;
  rows: WhoDataRow[];
};

const WHO_REMOTE_BASE = 'https://ghoapi.azureedge.net/api';
const WHO_COUNTRIES_STORAGE_KEY = 'who-countries-cache.v1';
const WHO_PROXY_ROOTS = resolveWhoProxyRoots();
const WHO_MODE = (import.meta.env.VITE_WHO_MODE ?? 'auto').toLowerCase();
const WHO_SNAPSHOT_BASE = `${import.meta.env.BASE_URL}who-snapshots`;
const WHO_MAX_GEO_VALUES = 5;
const WHO_MAX_SERIES = 28;
const WHO_MAX_PERIODS = 900;
const WHO_MAX_TOTAL_POINTS = 8000;
const IS_LOCAL_DEV =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

let whoSnapshotIndexPromise: Promise<WhoSnapshotIndex | null> | null = null;
const whoSnapshotDataPromises = new Map<string, Promise<WhoSnapshotData | null>>();

type WhoFetchMode = 'direct' | 'proxy';

function shouldTrySnapshots(): boolean {
  if (WHO_MODE === 'snapshot') return true;
  // In local dev we want fresh WHO data from the dev proxy, not pre-generated snapshots.
  if (WHO_MODE === 'auto' && IS_LOCAL_DEV) return false;
  return WHO_MODE === 'auto';
}

function isSnapshotOnlyMode(): boolean {
  return WHO_MODE === 'snapshot';
}

function normalizeSnapshotCountries(input: unknown): Array<{ code: string; label: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const code = typeof (entry as { code?: unknown }).code === 'string' ? (entry as { code: string }).code : '';
      const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label : '';
      return { code: code.toUpperCase().trim(), label: label.trim() };
    })
    .filter((entry) => entry.code && entry.label)
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchWhoSnapshotIndex(): Promise<WhoSnapshotIndex | null> {
  if (whoSnapshotIndexPromise) return whoSnapshotIndexPromise;

  const indexUrl = `${WHO_SNAPSHOT_BASE}/index.json`;
  whoSnapshotIndexPromise = (async () => {
    try {
      const response = await fetch(indexUrl);
      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) return null;

      const payload = (await response.json()) as WhoSnapshotIndex;
      return payload;
    } catch {
      return null;
    }
  })();

  return whoSnapshotIndexPromise;
}

async function fetchWhoSnapshotData(indicatorCode: string): Promise<WhoSnapshotData | null> {
  const cacheKey = indicatorCode.toUpperCase();
  const existing = whoSnapshotDataPromises.get(cacheKey);
  if (existing) return existing;

  const dataUrl = `${WHO_SNAPSHOT_BASE}/${encodeURIComponent(indicatorCode)}.json`;
  const promise = (async () => {
    try {
      const response = await fetch(dataUrl);
      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) return null;

      const payload = (await response.json()) as Partial<WhoSnapshotData>;
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      return {
        code: payload.code ?? indicatorCode,
        title: payload.title,
        rows,
      };
    } catch {
      return null;
    }
  })();

  whoSnapshotDataPromises.set(cacheKey, promise);
  return promise;
}

function normalizeProxyRoot(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function resolveWhoProxyRoots(): string[] {
  const configured = (import.meta.env.VITE_WHO_PROXY_ROOTS as string | undefined)
    ?.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
  const defaults: string[] = [];

  if (basePath && basePath !== '/') {
    defaults.push(`${basePath}/api/who`);
    // Some deployments expose WHO through `${base}/api/*` without a `/who` segment.
    defaults.push(basePath);
  } else {
    defaults.push('/api/who');
  }

  const deduped = new Set<string>();
  for (const root of [...(configured ?? []), ...defaults]) {
    deduped.add(normalizeProxyRoot(root));
  }

  return [...deduped];
}

function createWhoUrl(path: string): URL {
  return new URL(path, window.location.origin);
}

function toProxiedWhoUrl(url: string, proxyRoot: string): string {
  if (url.startsWith(WHO_REMOTE_BASE)) {
    return `${proxyRoot}/api${url.slice(WHO_REMOTE_BASE.length)}`;
  }

  if (url.startsWith('/api/')) {
    return `${proxyRoot}${url}`;
  }

  return url;
}

function toDirectWhoUrl(url: string): string {
  if (url.startsWith('/api/')) {
    return `${WHO_REMOTE_BASE}${url.slice('/api'.length)}`;
  }

  return url;
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
  const modeSequence: WhoFetchMode[] =
    WHO_MODE === 'direct'
      ? ['direct']
      : WHO_MODE === 'proxy'
        ? ['proxy']
        : IS_LOCAL_DEV
          ? ['proxy']
          : ['direct', 'proxy'];

  let lastError: Error | null = null;

  for (const mode of modeSequence) {
    if (mode === 'direct') {
      let nextUrl: string | null = url.toString();
      const rows: T[] = [];

      try {
        while (nextUrl) {
          const requestUrl = toDirectWhoUrl(nextUrl);
          const response = await fetch(requestUrl);
          if (!response.ok) {
            throw new Error(`WHO direct request failed with status ${response.status} for ${requestUrl}.`);
          }

          const contentType = response.headers.get('content-type') ?? '';
          if (!contentType.toLowerCase().includes('application/json')) {
            const bodyPreview = (await response.text()).slice(0, 120);
            throw new Error(
              `WHO direct request returned non-JSON content (${contentType || 'unknown'}) for ${requestUrl}. Body starts with: ${bodyPreview}`,
            );
          }

          let payload: WhoApiResponse<T>;
          try {
            payload = (await response.json()) as WhoApiResponse<T>;
          } catch {
            throw new Error(`WHO direct response could not be parsed as JSON for ${requestUrl}.`);
          }

          rows.push(...(payload.value ?? []));
          nextUrl = payload['@odata.nextLink'] ? toDirectWhoUrl(payload['@odata.nextLink']) : null;
        }

        return rows;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;

        if (WHO_MODE === 'direct') {
          throw normalizedError;
        }

        continue;
      }
    }

    for (let rootIndex = 0; rootIndex < WHO_PROXY_ROOTS.length; rootIndex += 1) {
      const proxyRoot = WHO_PROXY_ROOTS[rootIndex];
      let nextUrl: string | null = url.toString();
      const rows: T[] = [];
      let loadedPages = 0;

      try {
        while (nextUrl) {
          const requestUrl = toProxiedWhoUrl(nextUrl, proxyRoot);
          const response = await fetch(requestUrl);
          if (!response.ok) {
            throw new Error(`WHO request failed with status ${response.status} for ${requestUrl}.`);
          }

          const contentType = response.headers.get('content-type') ?? '';
          if (!contentType.toLowerCase().includes('application/json')) {
            const bodyPreview = (await response.text()).slice(0, 120);
            throw new Error(
              `WHO proxy returned non-JSON content (${contentType || 'unknown'}) for ${requestUrl}. This usually means the server is missing a reverse-proxy route for /api/who/ (or an equivalent base-prefixed route). Body starts with: ${bodyPreview}`,
            );
          }

          let payload: WhoApiResponse<T>;
          try {
            payload = (await response.json()) as WhoApiResponse<T>;
          } catch {
            throw new Error(`WHO response could not be parsed as JSON for ${requestUrl}.`);
          }

          rows.push(...(payload.value ?? []));
          nextUrl = payload['@odata.nextLink'] ?? null;
          loadedPages += 1;
        }

        return rows;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;

        // If the very first request for this root fails, try next configured root.
        if (loadedPages === 0 && rootIndex < WHO_PROXY_ROOTS.length - 1) {
          continue;
        }

        break;
      }
    }
  }

  throw lastError ?? new Error('WHO request failed for all configured proxy roots.');
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

  if (shouldTrySnapshots()) {
    const snapshotIndex = await fetchWhoSnapshotIndex();
    const snapshotCountries = normalizeSnapshotCountries(snapshotIndex?.countries);

    if (snapshotCountries.length > 0) {
      try {
        window.localStorage.setItem(WHO_COUNTRIES_STORAGE_KEY, JSON.stringify(snapshotCountries));
      } catch {
        // ignore storage errors
      }

      return snapshotCountries;
    }

    if (isSnapshotOnlyMode()) {
      return [
        { code: 'EST', label: 'Estonia' },
        { code: 'EUR', label: 'Europe region' },
      ];
    }
  }

  const url = createWhoUrl(`${WHO_REMOTE_BASE}/DIMENSION/COUNTRY/DimensionValues`);
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
    const normalized = row.Value.trim().toLowerCase();
    if (normalized === 'yes') return 1;
    if (normalized === 'no') return 0;

    const parsed = Number(row.Value.replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) return parsed;

    const firstNumber = row.Value.match(/-?\d+(?:[.,]\d+)?/);
    if (firstNumber) {
      const extracted = Number(firstNumber[0].replace(',', '.'));
      if (Number.isFinite(extracted)) return extracted;
    }
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
  if (shouldTrySnapshots()) {
    const snapshot = await fetchWhoSnapshotData(indicatorCode);
    if (snapshot?.title) {
      return snapshot.title;
    }

    if (isSnapshotOnlyMode()) {
      return null;
    }
  }

  const url = createWhoUrl(`${WHO_REMOTE_BASE}/Indicator`);
  url.searchParams.set('$format', 'json');
  url.searchParams.set('$top', '1');
  url.searchParams.set('$filter', `IndicatorCode eq '${indicatorCode}'`);

  const rows = await fetchWhoAllPages<WhoIndicator>(url);
  return rows[0]?.IndicatorName ?? null;
}

function resolveWhoSeries(
  selectedRows: WhoDataRow[],
  fallbackRows: WhoDataRow[],
  preferredGeos: string[],
): { series: DataSeries[]; periods: string[]; warningNote?: string } {
  let { series, periods } = mapRowsToSeries(selectedRows);
  let warningNote: string | undefined;

  if (series.length > 0) {
    return { series, periods, warningNote };
  }

  const fallbackGeos = pickFallbackGeos(fallbackRows, preferredGeos, 2);
  if (fallbackGeos.length > 0) {
    const narrowedRows = fallbackRows.filter((row) => fallbackGeos.includes((row.SpatialDim ?? '').toUpperCase()));
    const narrowed = mapRowsToSeries(narrowedRows);
    series = narrowed.series;
    periods = narrowed.periods;

    if (series.length > 0) {
      warningNote = `Selected geographies (${preferredGeos.join(', ')}) had no data; showing ${fallbackGeos.join(', ')} instead.`;
      return { series, periods, warningNote };
    }
  }

  const generic = mapRowsToSeries(fallbackRows);
  return { series: generic.series, periods: generic.periods, warningNote };
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

  if (geoValues.length > WHO_MAX_GEO_VALUES) {
    return {
      title: topic.title,
      subtitle: topic.description,
      decimals: topic.decimals ?? 2,
      unitSuffix: topic.unitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: countries,
      warning: `Too many geographies selected (${geoValues.length}). Please select up to ${WHO_MAX_GEO_VALUES} geographies for WHO indicators.`,
    };
  }

  const numericFilter = 'NumericValue ne null';

  let series: DataSeries[] = [];
  let periods: string[] = [];
  let warningNote: string | undefined;
  let indicatorNameFromSnapshot: string | null = null;

  if (shouldTrySnapshots()) {
    const snapshot = await fetchWhoSnapshotData(indicatorCode);

    if (snapshot) {
      indicatorNameFromSnapshot = snapshot.title ?? null;
      const fallbackRows = snapshot.rows.filter((row) => parseWhoNumericValue(row) !== null);
      const selectedRows = fallbackRows.filter((row) => geoValues.includes((row.SpatialDim ?? '').toUpperCase()));
      const resolved = resolveWhoSeries(selectedRows, fallbackRows, geoValues);
      series = resolved.series;
      periods = resolved.periods;
      warningNote = resolved.warningNote;
    } else if (isSnapshotOnlyMode()) {
      return {
        title: topic.title,
        subtitle: topic.description,
        decimals: topic.decimals ?? 2,
        unitSuffix: topic.unitSuffix,
        sourceUrl: topic.sourceUrl,
        series: [],
        periods: [],
        availableGeos: countries,
        warning:
          `No pre-generated WHO snapshot was found for indicator ${indicatorCode}. Run the WHO snapshot generator and redeploy static files.`,
      };
    }
  }

  if (series.length === 0 && !isSnapshotOnlyMode()) {
    const url = createWhoUrl(`${WHO_REMOTE_BASE}/${indicatorCode}`);
    url.searchParams.set('$format', 'json');
    url.searchParams.set('$top', '1000');
    url.searchParams.set('$filter', `${buildGeoFilter(geoValues)} and ${numericFilter}`);

    const rows = await fetchWhoAllPages<WhoDataRow>(url);

    const fallbackUrl = createWhoUrl(`${WHO_REMOTE_BASE}/${indicatorCode}`);
    fallbackUrl.searchParams.set('$format', 'json');
    fallbackUrl.searchParams.set('$top', '1000');
    fallbackUrl.searchParams.set('$filter', numericFilter);

    const fallbackRows = await fetchWhoAllPages<WhoDataRow>(fallbackUrl);
    const resolved = resolveWhoSeries(rows, fallbackRows, geoValues);
    series = resolved.series;
    periods = resolved.periods;
    warningNote = resolved.warningNote;
  }

  const indicatorName = indicatorNameFromSnapshot ?? (await fetchIndicatorName(indicatorCode)) ?? topic.title;

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

  const totalPointCount = series.reduce((sum, entry) => sum + entry.points.length, 0);
  if (
    series.length > WHO_MAX_SERIES ||
    periods.length > WHO_MAX_PERIODS ||
    totalPointCount > WHO_MAX_TOTAL_POINTS
  ) {
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
        `Dataset too large to process safely (series: ${series.length}, periods: ${periods.length}, points: ${totalPointCount}). ` +
        'Narrow geographies or choose a smaller indicator.',
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
