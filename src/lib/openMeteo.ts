import { OPEN_METEO_TOPIC_MAP } from '../features/dashboard/openMeteoTopicCatalog';
import type { DataPoint, DataSeries, TopicData, TopicDefinition } from '../features/dashboard/types';

type GeoPoint = {
  code: string;
  label: string;
  latitude: number;
  longitude: number;
};

type OpenMeteoDailyResponse = {
  daily?: {
    time?: string[];
    [key: string]: Array<number | null> | string[] | undefined;
  };
  daily_units?: Record<string, string>;
};

const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

const OPEN_METEO_GEOS: GeoPoint[] = [
  { code: 'TLL', label: 'Tallinn', latitude: 59.437, longitude: 24.7536 },
  { code: 'HEL', label: 'Helsinki', latitude: 60.1699, longitude: 24.9384 },
  { code: 'RIX', label: 'Riga', latitude: 56.9496, longitude: 24.1052 },
  { code: 'STO', label: 'Stockholm', latitude: 59.3293, longitude: 18.0686 },
  { code: 'CPH', label: 'Copenhagen', latitude: 55.6761, longitude: 12.5683 },
  { code: 'BER', label: 'Berlin', latitude: 52.52, longitude: 13.405 },
  { code: 'VNO', label: 'Vilnius', latitude: 54.6872, longitude: 25.2797 },
  { code: 'WAW', label: 'Warsaw', latitude: 52.2297, longitude: 21.0122 },
  { code: 'OSL', label: 'Oslo', latitude: 59.9139, longitude: 10.7522 },
  { code: 'AMS', label: 'Amsterdam', latitude: 52.3676, longitude: 4.9041 },
];

function inferSortKey(periodCode: string): number {
  const match = periodCode.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number(periodCode.replace(/\D/g, '')) || 0;
  return Number(`${match[1]}${match[2]}${match[3]}`);
}

function addDays(periodCode: string, days: number): string | null {
  const date = new Date(`${periodCode}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

  const recent = points.slice(-30);
  const ratios: number[] = [];
  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1].value;
    const current = recent[index].value;
    if (Math.abs(previous) > 1e-6) ratios.push(current / previous);
  }

  const trendRatio = ratios.length > 0 ? median(ratios) : 1;
  const dampedRatio = 1 + (clamp(trendRatio, 0.9, 1.1) - 1) * 0.35;
  const anchor = recent[recent.length - 1].value;

  return Array.from({ length: horizon }, (_, index) => anchor * dampedRatio ** (index + 1));
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
  };
}

function lookupGeo(code: string): GeoPoint | undefined {
  return OPEN_METEO_GEOS.find((geo) => geo.code === code.toUpperCase());
}

async function fetchGeoSeries(
  geo: GeoPoint,
  variableName: string,
): Promise<{ series: DataSeries; periods: string[]; unitSuffix?: string }> {
  const url = new URL(OPEN_METEO_ARCHIVE);
  url.searchParams.set('latitude', String(geo.latitude));
  url.searchParams.set('longitude', String(geo.longitude));
  url.searchParams.set('start_date', '2018-01-01');
  url.searchParams.set('end_date', new Date().toISOString().slice(0, 10));
  url.searchParams.set('daily', variableName);
  url.searchParams.set('timezone', 'UTC');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OpenMeteoDailyResponse;
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

  return {
    series: {
      id: geo.code,
      label: geo.label,
      points,
    },
    periods: times,
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

  const rows = await Promise.all(selectedGeos.map((geo) => fetchGeoSeries(geo, variableName)));
  const series = rows.map((row) => row.series).filter((entry) => entry.points.length > 0);

  const periodSet = new Set<string>();
  for (const row of rows) {
    for (const period of row.periods) periodSet.add(period);
  }

  const periods = [...periodSet].sort((a, b) => inferSortKey(a) - inferSortKey(b));
  const unitSuffix = topic.unitSuffix ?? rows.find((row) => row.unitSuffix)?.unitSuffix;

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
    for (let day = 1; day <= forecastHorizon; day += 1) {
      const nextPeriod = addDays(lastPoint.periodCode, day);
      if (!nextPeriod) break;
      futurePeriods.push(nextPeriod);
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
