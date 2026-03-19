import { OPEN_METEO_TOPIC_MAP } from '../features/dashboard/openMeteoTopicCatalog';
import type { DataPoint, DataSeries, TopicData, TopicDefinition } from '../features/dashboard/types';
import { clamp, getNextPeriodCode, inferSortKey, median } from './timeSeries';

type GeoPoint = {
  code: string;
  label: string;
  latitude: number;
  longitude: number;
  aliases?: string[];
};

type OpenMeteoDailyResponse = {
  daily?: {
    time?: string[];
    [key: string]: Array<number | null> | string[] | undefined;
  };
  daily_units?: Record<string, string>;
};

const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const OPEN_METEO_CACHE_TTL_MS = 10 * 60 * 1000;
const OPEN_METEO_MAX_RETRIES = 4;
const OPEN_METEO_BASE_RETRY_MS = 1000;
const OPEN_METEO_MAX_CONCURRENT_REQUESTS = 2;
const OPEN_METEO_HISTORY_DAYS = 4 * 365;
const OPEN_METEO_MAX_POINTS_PER_SERIES = 1200;
const OPEN_METEO_MAX_GEO_VALUES = 6;
const OPEN_METEO_MAX_SERIES = 28;
const OPEN_METEO_MAX_PERIODS = 900;
const OPEN_METEO_MAX_TOTAL_POINTS = 8000;

const openMeteoResponseCache = new Map<string, { expiresAt: number; payload: OpenMeteoDailyResponse }>();
const openMeteoInFlight = new Map<string, Promise<OpenMeteoDailyResponse>>();
let openMeteoActiveRequests = 0;
const openMeteoQueue: Array<() => void> = [];

const OPEN_METEO_GEOS: GeoPoint[] = [
  { code: 'TLL', label: 'Tallinn', latitude: 59.437, longitude: 24.7536, aliases: ['ESTONIA', 'EE', 'EST'] },
  { code: 'HEL', label: 'Helsinki', latitude: 60.1699, longitude: 24.9384, aliases: ['FINLAND', 'FI', 'FIN'] },
  { code: 'RIX', label: 'Riga', latitude: 56.9496, longitude: 24.1052, aliases: ['LATVIA', 'LV', 'LVA'] },
  { code: 'VNO', label: 'Vilnius', latitude: 54.6872, longitude: 25.2797, aliases: ['LITHUANIA', 'LT', 'LTU'] },
  { code: 'STO', label: 'Stockholm', latitude: 59.3293, longitude: 18.0686, aliases: ['SWEDEN', 'SE', 'SWE'] },
  { code: 'OSL', label: 'Oslo', latitude: 59.9139, longitude: 10.7522, aliases: ['NORWAY', 'NO', 'NOR'] },
  { code: 'CPH', label: 'Copenhagen', latitude: 55.6761, longitude: 12.5683, aliases: ['DENMARK', 'DK', 'DNK'] },
  { code: 'AMS', label: 'Amsterdam', latitude: 52.3676, longitude: 4.9041, aliases: ['NETHERLANDS', 'NL', 'NLD'] },
  { code: 'BER', label: 'Berlin', latitude: 52.52, longitude: 13.405, aliases: ['GERMANY', 'DE', 'DEU'] },
  { code: 'WAW', label: 'Warsaw', latitude: 52.2297, longitude: 21.0122, aliases: ['POLAND', 'PL', 'POL'] },
  { code: 'PAR', label: 'Paris', latitude: 48.8566, longitude: 2.3522, aliases: ['FRANCE', 'FR', 'FRA'] },
  { code: 'MAD', label: 'Madrid', latitude: 40.4168, longitude: -3.7038, aliases: ['SPAIN', 'ES', 'ESP'] },
  { code: 'ROM', label: 'Rome', latitude: 41.9028, longitude: 12.4964, aliases: ['ITALY', 'IT', 'ITA'] },
  { code: 'LON', label: 'London', latitude: 51.5072, longitude: -0.1276, aliases: ['UNITED KINGDOM', 'UK', 'GB', 'GBR'] },
  { code: 'DUB', label: 'Dublin', latitude: 53.3498, longitude: -6.2603, aliases: ['IRELAND', 'IE', 'IRL'] },
  { code: 'ATH', label: 'Athens', latitude: 37.9838, longitude: 23.7275, aliases: ['GREECE', 'GR', 'GRC'] },
  { code: 'LIS', label: 'Lisbon', latitude: 38.7223, longitude: -9.1393, aliases: ['PORTUGAL', 'PT', 'PRT'] },
  { code: 'PRG', label: 'Prague', latitude: 50.0755, longitude: 14.4378, aliases: ['CZECHIA', 'CZ', 'CZE'] },
  { code: 'BUD', label: 'Budapest', latitude: 47.4979, longitude: 19.0402, aliases: ['HUNGARY', 'HU', 'HUN'] },
  { code: 'BCH', label: 'Bucharest', latitude: 44.4268, longitude: 26.1025, aliases: ['ROMANIA', 'RO', 'ROU'] },
  { code: 'KIV', label: 'Kyiv', latitude: 50.4501, longitude: 30.5234, aliases: ['UKRAINE', 'UA', 'UKR'] },
  { code: 'ANK', label: 'Ankara', latitude: 39.9334, longitude: 32.8597, aliases: ['TURKIYE', 'TURKEY', 'TR', 'TUR'] },
  { code: 'TKY', label: 'Tokyo', latitude: 35.6762, longitude: 139.6503, aliases: ['JAPAN', 'JP', 'JPN', 'TOKYO'] },
  { code: 'WDC', label: 'Washington, D.C.', latitude: 38.9072, longitude: -77.0369, aliases: ['USA', 'US', 'UNITED STATES'] },
  { code: 'OTT', label: 'Ottawa', latitude: 45.4215, longitude: -75.6972, aliases: ['CANADA', 'CA', 'CAN'] },
  { code: 'BRA', label: 'Brasilia', latitude: -15.7939, longitude: -47.8828, aliases: ['BRAZIL', 'BR', 'BRA'] },
  { code: 'CAI', label: 'Cairo', latitude: 30.0444, longitude: 31.2357, aliases: ['EGYPT', 'EG', 'EGY'] },
  { code: 'KRT', label: 'Khartoum', latitude: 15.5007, longitude: 32.5599, aliases: ['SUDAN', 'SD', 'SDN'] },
  { code: 'NBO', label: 'Nairobi', latitude: -1.2921, longitude: 36.8219, aliases: ['KENYA', 'KE', 'KEN'] },
  { code: 'PRE', label: 'Pretoria', latitude: -25.7479, longitude: 28.2293, aliases: ['SOUTH AFRICA', 'ZA', 'ZAF'] },
  { code: 'DEL', label: 'New Delhi', latitude: 28.6139, longitude: 77.209, aliases: ['INDIA', 'IN', 'IND', 'DELHI'] },
  { code: 'BKK', label: 'Bangkok', latitude: 13.7563, longitude: 100.5018, aliases: ['THAILAND', 'TH', 'THA'] },
  { code: 'SEO', label: 'Seoul', latitude: 37.5665, longitude: 126.978, aliases: ['KOREA', 'KR', 'KOR'] },
  { code: 'CANB', label: 'Canberra', latitude: -35.2809, longitude: 149.13, aliases: ['AUSTRALIA', 'AU', 'AUS'] },
];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDefaultStartDate(endDate: Date): string {
  const start = new Date(endDate);
  start.setUTCDate(start.getUTCDate() - OPEN_METEO_HISTORY_DAYS);
  return formatDateUtc(start);
}

function decimatePoints(points: DataPoint[], maxPoints: number): DataPoint[] {
  if (points.length <= maxPoints) return points;

  const stride = Math.ceil(points.length / maxPoints);
  const reduced = points.filter((_, index) => index % stride === 0);

  // Always keep the latest point for accurate latest value + forecast anchor.
  const lastPoint = points[points.length - 1];
  if (lastPoint && reduced[reduced.length - 1]?.periodCode !== lastPoint.periodCode) {
    reduced.push(lastPoint);
  }

  return reduced;
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) return null;

  const asSeconds = Number(retryAfter);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(retryAfter);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }

  return null;
}

async function acquireOpenMeteoSlot(): Promise<void> {
  if (openMeteoActiveRequests < OPEN_METEO_MAX_CONCURRENT_REQUESTS) {
    openMeteoActiveRequests += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    openMeteoQueue.push(() => {
      openMeteoActiveRequests += 1;
      resolve();
    });
  });
}

function releaseOpenMeteoSlot(): void {
  openMeteoActiveRequests = Math.max(0, openMeteoActiveRequests - 1);
  const next = openMeteoQueue.shift();
  if (next) next();
}

async function withOpenMeteoSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireOpenMeteoSlot();
  try {
    return await task();
  } finally {
    releaseOpenMeteoSlot();
  }
}

async function requestOpenMeteoDaily(url: string): Promise<OpenMeteoDailyResponse> {
  const cached = openMeteoResponseCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const existingInFlight = openMeteoInFlight.get(url);
  if (existingInFlight) {
    return existingInFlight;
  }

  const requestPromise = withOpenMeteoSlot(async () => {
    for (let attempt = 0; attempt <= OPEN_METEO_MAX_RETRIES; attempt += 1) {
      const response = await fetch(url);

      if (response.ok) {
        const payload = (await response.json()) as OpenMeteoDailyResponse;
        openMeteoResponseCache.set(url, {
          expiresAt: Date.now() + OPEN_METEO_CACHE_TTL_MS,
          payload,
        });
        return payload;
      }

      const shouldRetry = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
      const isLastAttempt = attempt >= OPEN_METEO_MAX_RETRIES;

      if (!shouldRetry || isLastAttempt) {
        throw new Error(`Open-Meteo request failed with status ${response.status}.`);
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
      const backoffMs = OPEN_METEO_BASE_RETRY_MS * 2 ** attempt;
      const jitterMs = Math.floor(Math.random() * 250);
      await wait((retryAfterMs ?? backoffMs) + jitterMs);
    }

    throw new Error('Open-Meteo request failed after retries.');
  });

  openMeteoInFlight.set(url, requestPromise);
  try {
    return await requestPromise;
  } finally {
    openMeteoInFlight.delete(url);
  }
}

function computeForecast(points: DataPoint[], horizon: number): number[] {
  if (points.length < 2) {
    return Array(horizon).fill(points[points.length - 1]?.value ?? 0);
  }

  // Weather series are noisy and often seasonal. Exponential compounding can
  // explode unrealistically over long horizons, so use a bounded mean-reverting
  // forecast with mild drift.
  const recent = points.slice(-60);
  const recentValues = recent.map((point) => point.value);
  const anchor = recentValues[recentValues.length - 1];

  const deltas: number[] = [];
  for (let index = 1; index < recentValues.length; index += 1) {
    deltas.push(recentValues[index] - recentValues[index - 1]);
  }

  const baselineWindow = recentValues.slice(-14);
  const baseline = baselineWindow.reduce((sum, value) => sum + value, 0) / Math.max(1, baselineWindow.length);
  const medianDelta = deltas.length > 0 ? median(deltas) : 0;
  const absDeltas = deltas.map((value) => Math.abs(value));
  const volatility = absDeltas.length > 0 ? median(absDeltas) : 0;
  const drift = clamp(medianDelta, -Math.max(0.2, volatility), Math.max(0.2, volatility));

  const observedMin = Math.min(...recentValues);
  const observedMax = Math.max(...recentValues);
  const observedRange = Math.max(1, observedMax - observedMin);
  const lowerBound = observedMin - observedRange * 0.25;
  const upperBound = observedMax + observedRange * 0.25;
  const nonNegativeSeries = observedMin >= 0;

  const forecast: number[] = [];
  let current = anchor;

  for (let step = 0; step < horizon; step += 1) {
    const meanReversion = (baseline - current) * 0.12;
    const next = current + drift * 0.2 + meanReversion;
    current = clamp(next, lowerBound, upperBound);
    if (nonNegativeSeries) current = Math.max(0, current);
    forecast.push(current);
  }

  return forecast;
}

function toTopicDefinitionFromCode(code: string): TopicDefinition {
  const datasetCode = code.startsWith('daily.') ? code : `daily.${code}`;
  return {
    id: datasetCode,
    title: datasetCode,
    description: `Open-Meteo variable ${datasetCode}`,
    datasetCode,
    filters: {},
    geoValues: ['TLL', 'HEL'],
    decimals: 1,
    chartVariant: 'line',
    sourceUrl: 'https://open-meteo.com/en/docs',
    pubmed: {
      availability: 'unchecked',
      searchTerm: datasetCode,
      note: 'Added from variable code. Curate PubMed mapping if this topic is kept.',
    },
  };
}

function lookupGeo(code: string): GeoPoint | undefined {
  const query = code.trim().toUpperCase();
  if (!query) return undefined;

  return OPEN_METEO_GEOS.find((geo) => {
    if (geo.code.toUpperCase() === query) return true;
    if (geo.label.toUpperCase() === query) return true;
    return geo.aliases?.some((alias) => alias.toUpperCase() === query) ?? false;
  });
}

async function fetchGeoSeries(
  geo: GeoPoint,
  variableName: string,
): Promise<{ series: DataSeries; periods: string[]; unitSuffix?: string }> {
  const endDate = new Date();
  const endDateCode = formatDateUtc(endDate);
  const startDateCode = getDefaultStartDate(endDate);

  const url = new URL(OPEN_METEO_ARCHIVE);
  url.searchParams.set('latitude', String(geo.latitude));
  url.searchParams.set('longitude', String(geo.longitude));
  url.searchParams.set('start_date', startDateCode);
  url.searchParams.set('end_date', endDateCode);
  url.searchParams.set('daily', variableName);
  url.searchParams.set('timezone', 'UTC');

  const payload = await requestOpenMeteoDaily(url.toString());
  const times = payload.daily?.time ?? [];
  const values = (payload.daily?.[variableName] as Array<number | null> | undefined) ?? [];
  const unitSuffix = payload.daily_units?.[variableName];

  const points: DataPoint[] = times
    .map((time, index) => {
      const value = values[index];
      if (value == null || Number.isNaN(Number(value))) return null;
      return {
        periodCode: time,
        label: time,
        sortKey: inferSortKey(time),
        value: Number(value),
      } satisfies DataPoint;
    })
    .filter((point): point is DataPoint => Boolean(point));

  const decimatedPoints = decimatePoints(points, OPEN_METEO_MAX_POINTS_PER_SERIES);

  return {
    series: {
      id: geo.code,
      label: geo.label,
      points: decimatedPoints,
    },
    periods: decimatedPoints.map((point) => point.periodCode),
    unitSuffix,
  };
}

export async function fetchOpenMeteoTopicData(
  topicId: string,
  options?: {
    forecastHorizon?: number;
    filters?: Record<string, string | string[]>;
    seriesDimension?: string;
    geoValues?: string[];
  },
): Promise<TopicData> {
  const forecastHorizon = options?.forecastHorizon ?? 30;
  const topic = OPEN_METEO_TOPIC_MAP[topicId] ?? toTopicDefinitionFromCode(topicId);
  const datasetCode = topic.datasetCode;
  const variableName = datasetCode.startsWith('daily.') ? datasetCode.slice('daily.'.length) : datasetCode;

  const selectedGeos = (options?.geoValues?.length ? options.geoValues : topic.geoValues ?? ['TLL', 'HEL'])
    .map((code) => code.toUpperCase())
    .map((code) => lookupGeo(code))
    .filter((geo): geo is GeoPoint => Boolean(geo));

  if (selectedGeos.length === 0) {
    return {
      title: topic.title,
      subtitle: topic.description,
      decimals: topic.decimals ?? 1,
      unitSuffix: topic.unitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: OPEN_METEO_GEOS.map((geo) => ({ code: geo.code, label: geo.label })),
      warning: 'No valid geographies selected for Open-Meteo.',
    };
  }

  if (selectedGeos.length > OPEN_METEO_MAX_GEO_VALUES) {
    return {
      title: topic.title,
      subtitle: topic.description,
      decimals: topic.decimals ?? 1,
      unitSuffix: topic.unitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: OPEN_METEO_GEOS.map((geo) => ({ code: geo.code, label: geo.label })),
      warning: `Too many geographies selected (${selectedGeos.length}). Please select up to ${OPEN_METEO_MAX_GEO_VALUES} geographies.`,
    };
  }

  const rows = await Promise.all(selectedGeos.map((geo) => fetchGeoSeries(geo, variableName)));
  const series = rows.map((row) => row.series).filter((entry) => entry.points.length > 0);

  const periodSet = new Set<string>();
  for (const row of rows) {
    for (const period of row.periods) periodSet.add(period);
  }

  const periods = [...periodSet].sort((a, b) => inferSortKey(a) - inferSortKey(b));
  const unitSuffix = topic.unitSuffix ?? rows.find((row) => row.unitSuffix)?.unitSuffix;
  const totalPointCount = series.reduce((sum, entry) => sum + entry.points.length, 0);

  if (series.length === 0) {
    return {
      title: topic.title,
      subtitle: topic.description,
      decimals: topic.decimals ?? 1,
      unitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: OPEN_METEO_GEOS.map((geo) => ({ code: geo.code, label: geo.label })),
      warning: 'No observations were returned for this variable and selected geographies.',
    };
  }

  if (
    series.length > OPEN_METEO_MAX_SERIES ||
    periods.length > OPEN_METEO_MAX_PERIODS ||
    totalPointCount > OPEN_METEO_MAX_TOTAL_POINTS
  ) {
    return {
      title: topic.title,
      subtitle: topic.description,
      decimals: topic.decimals ?? 1,
      unitSuffix,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      availableGeos: OPEN_METEO_GEOS.map((geo) => ({ code: geo.code, label: geo.label })),
      warning:
        `Dataset too large to process safely (series: ${series.length}, periods: ${periods.length}, points: ${totalPointCount}). ` +
        'Reduce geographies or choose a smaller variable.',
    };
  }

  const baseSeries = series.filter((entry) => !entry.label.includes('(forecast)'));
  const forecastSeries: DataSeries[] = [];
  const skippedForecastSeries: string[] = [];

  for (const base of baseSeries) {
    if (base.points.length < 14) {
      skippedForecastSeries.push(base.label);
      continue;
    }

    const lastPoint = base.points[base.points.length - 1];
    if (!lastPoint) continue;

    const futurePeriods: string[] = [];
    let nextPeriod = getNextPeriodCode(lastPoint.periodCode);
    for (let day = 1; day <= forecastHorizon; day += 1) {
      if (!nextPeriod) break;
      futurePeriods.push(nextPeriod);
      nextPeriod = getNextPeriodCode(nextPeriod);
    }

    if (futurePeriods.length === 0) continue;

    const forecastValues = computeForecast(base.points, futurePeriods.length);
    for (const period of futurePeriods) {
      if (!periodSet.has(period)) {
        periodSet.add(period);
        periods.push(period);
      }
    }

    forecastSeries.push({
      id: `${base.id}-forecast`,
      label: `${base.label} (forecast)`,
      points: [
        { ...lastPoint, predicted: true },
        ...futurePeriods.map((period, index) => ({
          periodCode: period,
          label: period,
          sortKey: inferSortKey(period),
          value: forecastValues[index],
          predicted: true,
        })),
      ],
    });
  }

  periods.sort((a, b) => inferSortKey(a) - inferSortKey(b));

  const forecastDisabledReason =
    skippedForecastSeries.length > 0
      ? `Forecast skipped for ${skippedForecastSeries.join(', ')} (not enough historical points).`
      : undefined;

  return {
    title: topic.title,
    subtitle: topic.description,
    decimals: topic.decimals ?? 1,
    unitSuffix,
    sourceUrl: topic.sourceUrl,
    series: [...series, ...forecastSeries],
    periods,
    availableGeos: OPEN_METEO_GEOS.map((geo) => ({ code: geo.code, label: geo.label })),
    forecastDisabledReason,
  };
}
