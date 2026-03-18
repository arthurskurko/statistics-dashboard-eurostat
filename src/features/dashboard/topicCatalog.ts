import type { TopicDefinition } from './types';

export const TOPICS: TopicDefinition[] = [
  {
    id: 'population',
    title: 'Population',
    description: 'Population on 1 January for Estonia compared with the EU aggregate.',
    datasetCode: 'demo_pjan',
    filters: {
      age: 'TOTAL',
      sex: 'T',
      unit: 'NR',
    },
    geoValues: ['EE', 'EU27_2020'],
    decimals: 0,
    chartVariant: 'line',
    sourceUrl:
      'https://ec.europa.eu/eurostat/databrowser/view/demo_pjan/default/table?lang=en',
    pubmed: {
      availability: 'search-only',
      searchTerm: 'population',
    },
  },
  {
    id: 'unemployment-rate',
    title: 'Unemployment rate',
    // Eurostat changed the age breakdown in 2024–25; only 25–74 and <25 are now
    // available.  Use the 25–74 series to stay close to the previous “15–74”
    // working‑age definition.
    description:
      'Seasonally adjusted unemployment rate for ages 25-74, Estonia versus the EU aggregate.',
    datasetCode: 'une_rt_m',
    filters: {
      age: 'Y25-74',
      sex: 'T',
      s_adj: 'SA',
      unit: 'PC_ACT',
    },
    geoValues: ['EE', 'EU27_2020'],
    decimals: 1,
    unitSuffix: '%',
    chartVariant: 'line',
    sourceUrl:
      'https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table?lang=en',
    pubmed: {
      availability: 'search-only',
      searchTerm: 'unemployment',
    },
  },
  {
    id: 'inflation',
    title: 'Inflation (HICP annual rate)',
    description: 'All-items HICP annual rate of change for Estonia compared with the EU aggregate.',
    datasetCode: 'prc_hicp_manr',
    filters: {
      coicop: 'CP00',
      unit: 'RCH_A',
    },
    geoValues: ['EE', 'EU27_2020'],
    decimals: 1,
    unitSuffix: '%',
    chartVariant: 'line',
    sourceUrl:
      'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_manr/default/table?lang=en',
    pubmed: {
      availability: 'search-only',
      searchTerm: 'inflation',
    },
  },
  {
    id: 'immigration',
    title: 'Immigration',
    description: 'Total immigration flows into Estonia and the EU aggregate.',
    datasetCode: 'migr_imm1ctz',
    filters: {
      citizen: 'TOTAL',
      agedef: 'REACH',
      age: 'TOTAL',
      unit: 'NR',
      sex: 'T',
    },
    geoValues: ['EE', 'EU27_2020'],
    decimals: 0,
    chartVariant: 'line',
    sourceUrl:
      'https://ec.europa.eu/eurostat/databrowser/view/migr_imm1ctz/default/table?lang=en',
    pubmed: {
      availability: 'search-only',
      searchTerm: 'immigration',
    },
  },
  {
    id: 'induced-abortions',
    title: 'Induced abortions',
    description: 'Number of legally induced abortions, Estonia compared with the EU aggregate.',
    datasetCode: 'DEMO_FABORTORD',
    filters: {
      freq: 'A',
      unit: 'NR',
      age: 'TOTAL',
      ord_brth: 'TOTAL',
    },
    geoValues: ['EE', 'EU27_2020'],
    decimals: 0,
    chartVariant: 'line',
    sourceUrl:
      'https://ec.europa.eu/eurostat/databrowser/view/DEMO_FABORTORD/default/table?lang=en',
    pubmed: {
      availability: 'search-only',
      searchTerm: 'induced abortion',
    },
  },
  {
    id: 'gdp-per-capita',
    title: 'GDP per capita',
    description:
      'Real GDP per capita in chain linked volumes (2010), Estonia compared with the EU aggregate.',
    datasetCode: 'nama_10_pc',
    filters: {
      na_item: 'B1GQ',
      unit: 'CLV10_EUR_HAB',
    },
    geoValues: ['EE', 'EU27_2020'],
    decimals: 0,
    unitSuffix: '€',
    chartVariant: 'line',
    sourceUrl:
      'https://ec.europa.eu/eurostat/databrowser/view/nama_10_pc/default/table?lang=en',
    pubmed: {
      availability: 'search-only',
      searchTerm: 'GDP per capita',
    },
  },
];

export const TOPIC_MAP = Object.fromEntries(TOPICS.map((topic) => [topic.id, topic]));
