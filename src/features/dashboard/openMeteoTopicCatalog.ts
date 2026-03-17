import type { TopicDefinition } from './types';

export const OPEN_METEO_TOPICS: TopicDefinition[] = [
  {
    id: 'meteo-temp-mean',
    title: 'Daily mean temperature',
    description: 'Daily mean near-surface air temperature.',
    datasetCode: 'daily.temperature_2m_mean',
    filters: {},
    geoValues: ['TLL', 'HEL'],
    decimals: 1,
    unitSuffix: '°C',
    chartVariant: 'line',
    sourceUrl: 'https://open-meteo.com/en/docs',
  },
  {
    id: 'meteo-temp-max',
    title: 'Daily max temperature',
    description: 'Daily maximum near-surface air temperature.',
    datasetCode: 'daily.temperature_2m_max',
    filters: {},
    geoValues: ['TLL', 'HEL'],
    decimals: 1,
    unitSuffix: '°C',
    chartVariant: 'line',
    sourceUrl: 'https://open-meteo.com/en/docs',
  },
  {
    id: 'meteo-precip-sum',
    title: 'Daily precipitation sum',
    description: 'Daily total precipitation.',
    datasetCode: 'daily.precipitation_sum',
    filters: {},
    geoValues: ['TLL', 'HEL'],
    decimals: 1,
    unitSuffix: 'mm',
    chartVariant: 'line',
    sourceUrl: 'https://open-meteo.com/en/docs',
  },
  {
    id: 'meteo-wind-max',
    title: 'Daily max wind speed',
    description: 'Daily maximum wind speed at 10m.',
    datasetCode: 'daily.wind_speed_10m_max',
    filters: {},
    geoValues: ['TLL', 'HEL'],
    decimals: 1,
    unitSuffix: 'km/h',
    chartVariant: 'line',
    sourceUrl: 'https://open-meteo.com/en/docs',
  },
];

export const OPEN_METEO_TOPIC_MAP = Object.fromEntries(
  OPEN_METEO_TOPICS.map((topic) => [topic.id, topic]),
);
