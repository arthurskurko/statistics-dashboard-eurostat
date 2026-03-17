import type { TopicDefinition } from './types';

export const WHO_TOPICS: TopicDefinition[] = [
  {
    id: 'who-life-expectancy',
    title: 'Life expectancy at birth',
    description: 'WHO life expectancy at birth indicator for Estonia and the Europe region.',
    datasetCode: 'WHOSIS_000001',
    filters: {},
    geoValues: ['EST', 'EUR'],
    decimals: 1,
    chartVariant: 'line',
    sourceUrl: 'https://ghoapi.azureedge.net/api/WHOSIS_000001',
  },
  {
    id: 'who-obesity-adult',
    title: 'Obesity prevalence among adults',
    description: 'Age-standardized adult obesity prevalence for Estonia and the Europe region.',
    datasetCode: 'NCD_BMI_30A',
    filters: {},
    geoValues: ['EST', 'EUR'],
    decimals: 1,
    unitSuffix: '%',
    chartVariant: 'line',
    sourceUrl: 'https://ghoapi.azureedge.net/api/NCD_BMI_30A',
  },
  {
    id: 'who-diabetes-age-std',
    title: 'Diabetes prevalence (age-standardized)',
    description: 'WHO diabetes prevalence (age-standardized) for Estonia and the Europe region.',
    datasetCode: 'NCD_DIABETES_PREVALENCE_AGESTD',
    filters: {},
    geoValues: ['EST', 'EUR'],
    decimals: 1,
    unitSuffix: '%',
    chartVariant: 'line',
    sourceUrl: 'https://ghoapi.azureedge.net/api/NCD_DIABETES_PREVALENCE_AGESTD',
  },
];

export const WHO_TOPIC_MAP = Object.fromEntries(WHO_TOPICS.map((topic) => [topic.id, topic]));
