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
  extension?: {
    annotation?: Array<{ type?: string; title?: string }>;
  };
};

type DimensionInfo = {
  id: string;
  codes: string[];
  labels: Record<string, string>;
};

const EUROSTAT_BASE =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

// Some Eurostat datasets are enormous unless you narrow them by a common filter.
// When users request these datasets without additional filtering, apply a sane
// default so the app doesn't try to download & parse a multi‑million‑point payload.
const DEFAULT_FILTERS_FOR_LARGE_DATASETS: Record<string, Record<string, string>> = {
  // Young immigrants by sex and country of birth (this table is extremely large).
  // Default to raw counts (NR) so the numbers match the previous view.
  // Do NOT force age or sex here, because those splits are essential for the chart.
  yth_demo_070: {
    unit: 'NR',
    c_birth: 'TOTAL',
  },
};

function buildUrlForTopic(topic: { datasetCode: string; filters: Record<string, string | string[]>; geoValues?: string[]; extraFilters?: Record<string, string | string[]> }): string {
  const url = new URL(`${EUROSTAT_BASE}/${topic.datasetCode}`);
  url.searchParams.set('lang', 'en');

  for (const [key, value] of Object.entries(topic.filters)) {
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      url.searchParams.append(key, entry);
    }
  }

  for (const [key, value] of Object.entries(topic.extraFilters ?? {})) {
    if (!value) continue;
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

  const quarterlyMatch = periodCode.match(/^(\d{4})-?Q(\d)$/i);
  if (quarterlyMatch) {
    return `${quarterlyMatch[1]} Q${quarterlyMatch[2]}`;
  }

  return periodCode;
}

function getNextPeriodCode(periodCode: string): string | null {
  const annual = /^\d{4}$/;
  const monthly = /^(\d{4})M(\d{2})$/;
  const quarterly = /^(\d{4})-?Q(\d)$/i;
  const halfYear = /^(\d{4})S(\d)$/i;

  if (annual.test(periodCode)) {
    return String(Number(periodCode) + 1);
  }

  const monthlyMatch = periodCode.match(monthly);
  if (monthlyMatch) {
    const year = Number(monthlyMatch[1]);
    const month = Number(monthlyMatch[2]);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}M${String(nextMonth).padStart(2, '0')}`;
  }

  const quarterlyMatch = periodCode.match(quarterly);
  if (quarterlyMatch) {
    const year = Number(quarterlyMatch[1]);
    const quarter = Number(quarterlyMatch[2]);
    const nextQuarter = quarter === 4 ? 1 : quarter + 1;
    const nextYear = quarter === 4 ? year + 1 : year;
    return `${nextYear}Q${nextQuarter}`;
  }

  const halfYearMatch = periodCode.match(halfYear);
  if (halfYearMatch) {
    const year = Number(halfYearMatch[1]);
    const half = Number(halfYearMatch[2]);
    const nextHalf = half === 2 ? 1 : 2;
    const nextYear = half === 2 ? year + 1 : year;
    return `${nextYear}S${nextHalf}`;
  }

  return null;
}

export type FetchStats = Record<
  string,
  {
    lastFetch: string;
    lastForecast?: string;
    forecastHorizon?: number;
    forecastDisabledReason?: string;
  }
>;

const STATS_STORAGE_KEY = 'estonia-statistics-dashboard.stats';

function recordFetchStats(
  topicId: string,
  update: Partial<FetchStats[string]>,
): void {
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    const stats = raw ? (JSON.parse(raw) as FetchStats) : ({} as FetchStats);
    stats[topicId] = {
      ...(stats[topicId] ?? {}),
      ...update,
    };
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    window.dispatchEvent(new CustomEvent('dashboard:stats-updated'));
  } catch {
    // ignore storage failures
  }
}

function parseSeries(
  dataset: JsonStatDataset,
  fallbackLabel: string,
  seriesDimensionId?: string,
): { series: DataSeries[]; periods: string[] } {
  const dimensions = getDimensionInfo(dataset);
  const timeDimension = dimensions.find((dimension) => /time/i.test(dimension.id)) ?? dimensions.at(-1);
  const geoDimension = dimensions.find((dimension) => dimension.id.toLowerCase() === 'geo');
  const seriesDimension = seriesDimensionId
    ? dimensions.find((dimension) => dimension.id === seriesDimensionId)
    : undefined;
  const seriesDimensionIndex = seriesDimension
    ? dimensions.findIndex((dimension) => dimension.id === seriesDimension.id)
    : -1;

  if (!timeDimension) {
    throw new Error('Eurostat response did not include a time dimension.');
  }

  const timeDimensionIndex = dimensions.findIndex((dimension) => dimension.id === timeDimension.id);
  const geoDimensionIndex = geoDimension
    ? dimensions.findIndex((dimension) => dimension.id === geoDimension.id)
    : -1;

  // always expose all period codes, sorted by inferred sort key
  let periods = [...timeDimension.codes]
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

    let seriesLabel = geoLabel;
    if (seriesDimension && seriesDimensionIndex >= 0) {
      const seriesCode = seriesDimension.codes[positions[seriesDimensionIndex]];
      const seriesValueLabel = seriesDimension.labels[seriesCode] ?? seriesCode;
      seriesLabel = `${geoLabel} — ${seriesValueLabel}`;
    }

    const point: DataPoint = {
      periodCode,
      label: formatPeriodLabel(periodCode),
      sortKey: inferSortKey(periodCode),
      value: Number(rawValue),
    };

    const existing = seriesMap.get(seriesLabel) ?? [];
    existing.push(point);
    seriesMap.set(seriesLabel, existing);
  }

  const series = [...seriesMap.entries()]
    .map(([label, points]) => {
      const sortedPoints = points.sort((first, second) => first.sortKey - second.sortKey);
      const uniquePoints: DataPoint[] = [];
      const seenPeriodCodes = new Set<string>();

      // If a dataset includes extra dimensions that are not part of the series
      // key (for example sex=T/M/F), keep the first value per period so charts,
      // latest values, and forecasts are anchored to the same point.
      for (const point of sortedPoints) {
        if (seenPeriodCodes.has(point.periodCode)) continue;
        seenPeriodCodes.add(point.periodCode);
        uniquePoints.push(point);
      }

      return {
        id: label,
        label,
        points: uniquePoints,
      };
    })
    .filter((series) => series.points.length > 0);

  // Drop trailing time periods that have no data points for any series. Eurostat
  // sometimes publishes a time label (e.g. next year) without any values yet.
  const allPointSortKeys = series.flatMap((s) => s.points.map((p) => p.sortKey));
  if (allPointSortKeys.length > 0) {
    const maxSortKey = Math.max(...allPointSortKeys);
    periods = periods.filter((p) => inferSortKey(p) <= maxSortKey);
  }

  // Some datasets (notably EU aggregates) can show a partially-reported new year
  // with a value far below the previous year. Treat these as incomplete and drop
  // them so they don't anchor the “latest” value or ruin the forecast.
  for (const s of series) {
    if (!/european union|eu27/i.test(s.label)) continue;
    while (s.points.length > 1) {
      const last = s.points[s.points.length - 1];
      const prev = s.points[s.points.length - 2];
      if (last.value === 0) {
        s.points.pop();
        continue;
      }
      // If the final point is dramatically smaller than the prior year, assume it
      // is a partial reporting artifact rather than a real drop.
      if (last.value < prev.value * 0.35) {
        s.points.pop();
        continue;
      }
      break;
    }
  }

  return { series, periods };
}

export async function fetchTopicData(
  topicId: string,
  options?: {
    forecastHorizon?: number;
    filters?: Record<string, string | string[]>;
    seriesDimension?: string;
    geoValues?: string[];
  },
): Promise<TopicData> {
  let topic = TOPIC_MAP[topicId];
  const forecastHorizon = options?.forecastHorizon ?? 20;
  const extraFilters = { ...(options?.filters ?? {}) };

  // Apply dataset-specific default filters for known huge tables.
  // These defaults are only applied if the user has not already specified the filter.
  const datasetCode = topic?.datasetCode ?? topicId;
  const defaultFilters = DEFAULT_FILTERS_FOR_LARGE_DATASETS[datasetCode];
  if (defaultFilters) {
    for (const [key, value] of Object.entries(defaultFilters)) {
      if (!(key in extraFilters) && !(key in (topic?.filters ?? {}))) {
        extraFilters[key] = value;
      }
    }
  }

  // Default to EE + EU27 for topics that don’t explicitly specify a geo list.
  // Treat an empty array as unset (so it doesn't cause an unfiltered download).
  let geoValues =
    options?.geoValues && options.geoValues.length > 0
      ? options.geoValues
      : topic?.geoValues?.length
      ? topic.geoValues
      : ['EE', 'EU27_2020'];

  // Safety guard: never request the full dataset without at least one geo filter.
  if (geoValues.length === 0) {
    console.warn('fetchTopicData: geoValues empty, defaulting to EE to avoid huge download');
    geoValues = ['EE'];
  }

  if (!topic) {
    // Allow fetching by dataset code directly (custom topics).
    // Try to look up some metadata from the catalog (title/description) when
    // the topic is not a known predefined one.
    let catalogTitle: string | undefined;
    let catalogDescription: string | undefined;

    try {
      const catalogResp = await fetch(`${import.meta.env.BASE_URL}catalog.json`);
      if (catalogResp.ok) {
        const catalog = (await catalogResp.json()) as Array<{ code: string; title?: string; description?: string }>;
        const match = catalog.find((entry) => entry.code?.toLowerCase() === topicId.toLowerCase());
        catalogTitle = match?.title?.trim();
        catalogDescription = match?.description?.trim();
      }
    } catch {
      // ignore failures; fall back to dataset id
    }

    topic = {
      id: topicId,
      title: catalogTitle ?? topicId,
      description: catalogDescription ?? `Eurostat dataset ${topicId}`,
      datasetCode: topicId,
      filters: {},
      // Default to not fetching the full world: only Estonia.
      geoValues: ['EE'],
      decimals: 0,
      sourceUrl: `https://ec.europa.eu/eurostat/databrowser/view/${topicId}/default/table?lang=en`,
    };
  }

  const attemptFetch = async (
    filters: Record<string, string | string[]>,
    overrideGeoValues?: string[],
  ) => {
    const url = buildUrlForTopic({
      ...topic,
      extraFilters: filters,
      geoValues: overrideGeoValues ?? geoValues,
    });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Eurostat request failed with status ${response.status}.`);
    }
    const dataset = (await response.json()) as JsonStatDataset;
    return { dataset, filters };
  };

  // Safeguard: if the user is splitting by a dimension (especially `unit`) and the
  // resulting series would be huge (many geo × unit combinations), avoid fetching
  // the full dataset and instead return an early warning.
  const effectiveGeoValues = (options?.geoValues && options.geoValues.length > 0)
    ? options.geoValues
    : topic.geoValues?.length
    ? topic.geoValues
    : ['EE'];

  const unitFilter = options?.filters?.unit ?? topic.filters?.unit;
  const unitCount = Array.isArray(unitFilter) ? unitFilter.length : unitFilter ? 1 : 0;
  const geoCount = effectiveGeoValues.length;

  const MAX_GEO_UNIT_COMBINATIONS = 30;
  if (options?.seriesDimension === 'unit') {
    if (unitCount === 0) {
      const warning =
        'Split by unit requires selecting at least one unit. Please choose one or more units to continue.';
      return {
        title: topic.title,
        subtitle: topic.description,
        unitSuffix: topic.unitSuffix,
        decimals: topic.decimals ?? 0,
        sourceUrl: topic.sourceUrl,
        series: [],
        periods: [],
        warning,
      };
    }

    if (geoCount * unitCount > MAX_GEO_UNIT_COMBINATIONS) {
      const warning =
        `Dataset too large for unit split (${geoCount} geos × ${unitCount} units). ` +
        'Reduce the number of selected countries or units and try again.';
      return {
        title: topic.title,
        subtitle: topic.description,
        unitSuffix: topic.unitSuffix,
        decimals: topic.decimals ?? 0,
        sourceUrl: topic.sourceUrl,
        series: [],
        periods: [],
        warning,
      };
    }
  }

  const buildEuAggregate = (dataset: JsonStatDataset): DataSeries | null => {
    const dimensions = getDimensionInfo(dataset);
    const timeDim = dimensions.find((d) => /time/i.test(d.id)) ?? dimensions.at(-1);
    const geoDim = dimensions.find((d) => d.id.toLowerCase() === 'geo');
    if (!timeDim || !geoDim) return null;

    const timeIndex = dimensions.findIndex((d) => d.id === timeDim.id);
    const geoIndex = dimensions.findIndex((d) => d.id === geoDim.id);

    const periods = timeDim.codes;

    const points = periods.map((code) => ({
      periodCode: code,
      label: formatPeriodLabel(code),
      sortKey: inferSortKey(code),
      value: 0,
    }));

    const values = Array.isArray(dataset.value)
      ? dataset.value.map((v, i) => [i, v] as const)
      : Object.entries(dataset.value).map(([i, v]) => [Number(i), v] as const);

    for (const [flatIndex, rawValue] of values) {
      if (rawValue == null || Number.isNaN(Number(rawValue))) continue;
      const pos = unravelIndex(flatIndex, dataset.size);
      const geoCode = geoDim.codes[pos[geoIndex]];
      // Do not include any existing EU aggregates in the sum.
      if (/^EU/i.test(geoCode) && geoCode !== 'EU27_2020') continue;

      const periodCode = timeDim.codes[pos[timeIndex]];
      const point = points.find((p) => p.periodCode === periodCode);
      if (point) {
        point.value += Number(rawValue);
      }
    }

    return {
      id: 'EU27_2020-aggregate',
      label: 'European Union - 27 countries (from 2020)',
      points,
    };
  };

  const { dataset: initialDataset } = await attemptFetch(extraFilters);

  const valueCount = Array.isArray(initialDataset.value)
    ? initialDataset.value.length
    : Object.keys(initialDataset.value).length;
  const maxAllowedValues = 250_000;
  const tooLarge = valueCount > maxAllowedValues;

  const extraDimensions = (() => {
    const dimensions = getDimensionInfo(initialDataset);
    const timeDimension = dimensions.find((d) => /time/i.test(d.id)) ?? dimensions.at(-1);
    const geoDimension = dimensions.find((d) => d.id.toLowerCase() === 'geo');

    const extra = dimensions
      .filter((d) => d.id !== timeDimension?.id && d.id !== geoDimension?.id)
      .map((d) => ({
        id: d.id,
        label: d.id,
        values: d.codes.map((code) => ({ code, label: d.labels[code] ?? code })),
      }));

    return extra.length > 0 ? extra : undefined;
  })();

  const availableGeos = (() => {
    const geoDim = initialDataset.dimension.geo;
    if (!geoDim) return undefined;
    const index = geoDim.category.index;
    const labels = geoDim.category.label ?? {};

    const idx = index as string[] | Record<string, number>;
    const codes = Array.isArray(idx)
      ? idx
      : Object.entries(idx).sort((a, b) => (a[1] as number) - (b[1] as number)).map(([code]) => code);

    return codes.map((code) => ({ code, label: labels[code] ?? code }));
  })();

  let series: DataSeries[] = [];
  let periods: string[] = [];
  let warning: string | undefined;

  // ------------------------------------------------------------------
  // For yth_demo_070 we want to keep the response small, but still allow the
  // UI to show all available sex/age/c_birth choices.
  //
  // Strategy:
  // 1) Fetch the normal (possibly filtered) dataset for chart data.
  // 2) Fetch a tiny metadata response (single geo + single time) to discover
  //    all valid codes for the selectable dimensions.
  // ------------------------------------------------------------------
  if (topicId === 'yth_demo_070') {
    const timeDim = initialDataset.dimension.time?.category?.index;
    const latestTime = Array.isArray(timeDim)
      ? timeDim.at(-1)
      : Object.entries(timeDim ?? {}).sort((a, b) => (a[1] as number) - (b[1] as number)).at(-1)?.[0];

    if (latestTime) {
      try {
        const metaFilters: Record<string, string | string[]> = { time: latestTime };
        const unitFilter = extraFilters.unit ?? topic.filters?.unit;
        if (unitFilter) metaFilters.unit = unitFilter;

        const { dataset: meta } = await attemptFetch(metaFilters, ['EE']);
        const metaDims = getDimensionInfo(meta);

        const injectDim = (dimId: string, label: string) => {
          const dim = metaDims.find((d) => d.id === dimId);
          if (!dim || !extraDimensions) return;
          const values = dim.codes.map((code) => ({ code, label: dim.labels[code] ?? code }));
          const existing = extraDimensions.find((d) => d.id === dimId);
          if (existing) existing.values = values;
          else extraDimensions.push({ id: dimId, label, values });
        };

        injectDim('sex', 'Sex');
        injectDim('age', 'Age');
        injectDim('agedef', 'Age definition');
        injectDim('c_birth', 'Country of birth');
      } catch {
        // Ignore metadata fetch failures; it is purely a UX enhancement.
      }
    }
  }

  const getObsCount = (dataset: JsonStatDataset): number | undefined => {
    const ann = dataset.extension?.annotation;
    if (!Array.isArray(ann)) return undefined;
    const obs = ann.find((annotation) => annotation.type === 'OBS_COUNT')?.title;
    const num = Number(String(obs).replace(/\D/g, ''));
    return Number.isFinite(num) ? num : undefined;
  };

  const obsCount = getObsCount(initialDataset);
  const safeToFetchFull = obsCount == null || obsCount <= maxAllowedValues;

  if (tooLarge) {
    warning = `Dataset contains ${valueCount.toLocaleString()} observations, which is too large to render. Please apply additional filters (e.g. select a sex, age group or country) to reduce the dataset size.`;
  } else {
    ({ series, periods } = parseSeries(initialDataset, topic.title, options?.seriesDimension));

    // If the API returns an empty series list, it typically means the selected
    // filters (including any defaults we applied) do not match any data.
    if (series.length === 0) {
      warning =
        'No observations were returned for this dataset with the current filters. ' +
        'Try selecting a different dataset or adjusting the filters (e.g., change the geo, time or dimension selections).';
    }

    // If the dataset contains an extremely large number of series (e.g. many
    // geos or multi-dimensional splits), truncate them so the UI remains responsive.
    const MAX_SERIES = 40;
    if (series.length > MAX_SERIES) {
      warning =
        warning ??
        `Too many series (${series.length}) to display. Showing the first ${MAX_SERIES}. ` +
          'Please reduce the number of selected countries or split dimensions.';
      series = series.slice(0, MAX_SERIES);
    }

    // If the user is splitting by a dimension (e.g. unit) and the resulting series
    // list is still large, render a friendly warning instead of trying to render
    // an excessively large chart.
    const MAX_SAFE_SERIES = 20;
    if (options?.seriesDimension && series.length > MAX_SAFE_SERIES) {
      warning =
        warning ??
        `Too many series (${series.length}) for the selected split dimension. ` +
          'Reduce the number of selected values or remove the split dimension.';
      series = [];
      periods = [];
    }

    const requestedEu = (geoValues ?? topic.geoValues ?? []).includes('EU27_2020');
    const hasEuInResponse = availableGeos?.some((g) => g.code === 'EU27_2020');

    if (requestedEu && !hasEuInResponse && !warning) {
      if (safeToFetchFull) {
        try {
          const { dataset: fullDataset } = await attemptFetch(extraFilters, []);
          const euAggregate = buildEuAggregate(fullDataset);
          if (euAggregate) {
            series.push(euAggregate);
          }
        } catch {
          // ignore failures; leave the missing data warning in place
        }
      } else {
        warning =
          'EU aggregate not available for this dataset without downloading a large dataset. ' +
          'Try applying more specific filters or removing the EU aggregate selection.';
      }
    }
  }

  // If the topic doesn't explicitly specify a unit suffix (e.g. '%'), and
  // the dataset defines a single unit, use that as a display suffix so the UI
  // doesn't look like it's showing raw counts.
  let unitSuffix = topic.unitSuffix;
  if (!unitSuffix) {
    const unitDim = initialDataset.dimension.unit;
    const unitLabels = unitDim?.category?.label;
    const unitIndex = unitDim?.category?.index;

    if (unitLabels && unitIndex) {
      const unitCodes = Array.isArray(unitIndex)
        ? unitIndex
        : Object.entries(unitIndex)
            .sort((a, b) => a[1] - b[1])
            .map(([code]) => code);

      if (unitCodes.length === 1) {
        const label = unitLabels[unitCodes[0]];
        // Map common unit descriptions to simple suffixes.
        if (/percent/i.test(label)) unitSuffix = '%';
        else if (/number/i.test(label) || /count/i.test(label)) unitSuffix = '';
        else unitSuffix = label;
      }
    }
  }

  if (warning) {
    return {
      title: topic.title,
      subtitle: topic.description,
      unitSuffix,
      decimals: topic.decimals ?? 0,
      sourceUrl: topic.sourceUrl,
      series: [],
      periods: [],
      extraDimensions,
      availableGeos,
      warning,
    };
  }

  // Trim trailing zero values (often used as a placeholder for missing future data).
  for (const s of series) {
    while (s.points.length > 0 && s.points[s.points.length - 1].value === 0) {
      s.points.pop();
    }
  }

  // Sometimes the dataset includes a partial new year (e.g., 2024) where only a few
  // countries have reported. Treat these as incomplete series, so they don't
  // become the "latest" value or anchor the forecast.
  const trimIncomplete = (s: DataSeries) => {
    if (!/european union|eu27/i.test(s.label)) return;

    while (s.points.length > 1) {
      const last = s.points[s.points.length - 1];
      const prev = s.points[s.points.length - 2];
      if (last.value === 0 || last.value < prev.value * 0.35) {
        s.points.pop();
        continue;
      }
      break;
    }
  };

  for (const s of series) {
    trimIncomplete(s);
  }

  // Align x-axis periods with the last available point across all series.
  const maxSortKey = Math.max(...series.flatMap((s) => s.points.map((p) => p.sortKey)));
  periods = periods.filter((p) => inferSortKey(p) <= maxSortKey);

  const baseSeries = series.filter((s) => !s.label.includes('(forecast)'));

  // Track series for which a forecast is not reliable. For very small counts,
  // ratio-based extrapolation tends to collapse toward zero and is misleading.
  const skippedForecastSeries: string[] = [];
  let forecastDisabledReason: string | undefined;

  // Only use precomputed forecasts when no additional filters are applied.
  // Filters mean the series being displayed may be a subset of the data used
  // to build the cached forecast file.
  const usePrecomputedForecast = Object.keys(extraFilters).length === 0;

  let precomputedForecast: number[] | null = null;
  if (usePrecomputedForecast) {
    // Try to load precomputed forecasts from /public/forecasts/<dataset>.json (Python/R output).
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}forecasts/${topic.datasetCode}.json`);
      if (resp.ok) {
        const fc = (await resp.json()) as { forecast?: number[] };
        if (Array.isArray(fc.forecast) && fc.forecast.length > 0) {
          precomputedForecast = fc.forecast;
        }
      }
    } catch {
      // ignore and fall back to computed forecast
    }
  }

  // Forecast function: estimate future values from recent year-on-year ratios.
  // This avoids huge spikes/drops when the last two points are anomalous.
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const computeForecast = (points: { periodCode: string; value: number }[]) => {
    if (points.length < 2) return Array(forecastHorizon).fill(points[points.length - 1]?.value ?? 0);

    // Use a longer window to reduce the impact of short-term spikes/drops.
    const recent = points.slice(-8); // use up to last 8 points to smooth
    const ratios: number[] = [];
    for (let i = 1; i < recent.length; i += 1) {
      const prev = recent[i - 1].value;
      const curr = recent[i].value;
      if (prev > 0) ratios.push(curr / prev);
    }

    // Use the median year-on-year ratio and dampen it toward 1 to avoid extreme extrapolations.
    const rawRatio = median(ratios.length ? ratios : [1]);
    const ratio = 1 + (clamp(rawRatio, 0.7, 1.1) - 1) * 0.5;

    const lastValue = recent[recent.length - 1].value;
    const rawForecast = Array.from({ length: forecastHorizon }, (_, idx) => lastValue * ratio ** (idx + 1));

    // Smoothly ramp from the last observed value into the forecast so the
    // predicted line doesn't jump abruptly when the first forecast point is
    // materially different.
    const rampYears = Math.min(3, forecastHorizon);
    return rawForecast.map((val, idx) => {
      if (idx >= rampYears) return val;
      const t = (idx + 1) / (rampYears + 1);
      return lastValue + (val - lastValue) * t;
    });
  };

  const forecastSeries: DataSeries[] = [];

  // Build forecasts for each series, but skip series that are too small or sparse.
  for (const base of baseSeries) {
    const points = base.points;
    const maxValue = Math.max(...points.map((p) => p.value), 0);
    // For small values, ratio-based extrapolation is unstable and usually misleading.
    // Lower the threshold to 5 so small-but-not-tiny series still get a forecast.
    // Allow 3 points (instead of 4) so series like Sweden (with 3 years) can still be forecasted.
    if (points.length < 3 || maxValue < 5) {
      skippedForecastSeries.push(base.label);
      continue;
    }

    const lastPoint = points[points.length - 1];
    if (!lastPoint) continue;

    const years: string[] = [];
    let nextCode = getNextPeriodCode(lastPoint.periodCode);
    for (let i = 0; i < forecastHorizon; i += 1) {
      if (!nextCode) break;
      years.push(nextCode);
      nextCode = getNextPeriodCode(nextCode);
    }

    const yearLabels = years.map((year) => formatPeriodLabel(year));
    for (const label of yearLabels) {
      if (!periods.includes(label)) periods.push(label);
    }

    // Keep the period list sorted and unique.
    periods = Array.from(new Set(periods)).sort((a, b) => inferSortKey(a) - inferSortKey(b));

    const isEu = (label: string) =>
      label.toLowerCase().includes('european union') || label.toLowerCase().includes('eu27');

    let forecastValues: number[];
    const basePoints = points.map((p) => ({ periodCode: p.periodCode, value: p.value }));

    if (isEu(base.label) && precomputedForecast && precomputedForecast.length > 0) {
      // apply precomputed forecast only to EU series
      forecastValues = precomputedForecast.slice(0, years.length);

      // If the precomputed forecast collapses quickly (often due to a short-term data dip),
      // fall back to the built-in extrapolation so we don't show a misleading 0/near-zero trend.
      const lastReal = basePoints[basePoints.length - 1]?.value ?? 0;
      const firstForecast = forecastValues[0] ?? 0;
      const dangerouslyLow = firstForecast <= 0 || firstForecast < lastReal * 0.35;
      const containsZero = forecastValues.some((v) => v <= 0);
      if (dangerouslyLow || containsZero) {
        forecastValues = computeForecast(basePoints);
      }
    } else {
      forecastValues = computeForecast(basePoints);
    }

    // Ensure we always have enough forecast points; if precomputed data is shorter
    // than the requested horizon, pad with the last available value.
    if (forecastValues.length < years.length) {
      const lastVal = forecastValues[forecastValues.length - 1] ?? lastPoint.value;
      forecastValues = [...forecastValues, ...Array(years.length - forecastValues.length).fill(lastVal)];
    }

    const pointsOut = [
      { ...lastPoint, predicted: true },
      ...years.map((year, idx) => ({
        periodCode: year,
        label: yearLabels[idx],
        sortKey: inferSortKey(year),
        value: forecastValues[idx],
        predicted: true,
      })),
    ].sort((a, b) => a.sortKey - b.sortKey);

    forecastSeries.push({
      id: `${base.id}-forecast`,
      label: `${base.label} (forecast)`,
      points: pointsOut,
    });
  }

  if (skippedForecastSeries.length > 0) {
    forecastDisabledReason = `Forecast skipped for ${skippedForecastSeries.join(', ')} (values too small or sparse).`;
  }

  series = [...series, ...forecastSeries];

  // Safety guard for split-series charts: rendering many lines across many
  // periods (especially after forecast expansion) can freeze the browser tab.
  // Estimate the plotted workload and short-circuit with a warning when needed.
  const renderPointBudget = series.length * periods.length;
  const MAX_RENDER_POINT_BUDGET = 250;
  if (options?.seriesDimension && renderPointBudget > MAX_RENDER_POINT_BUDGET) {
    warning =
      `Selection would render ${renderPointBudget.toLocaleString()} points ` +
      `(${series.length} series × ${periods.length} periods), which may freeze the browser. ` +
      'Reduce countries, lower forecast horizon, or disable split series.';
    series = [];
    periods = [];
  }

  if (series.length === 0) {
    warning =
      warning ??
      'No observations were returned for this topic. This can happen if the dataset filters are out of date, the API is temporarily unavailable, or the dataset is not available for the selected filters.';
  }

  recordFetchStats(topicId, {
    lastFetch: new Date().toISOString(),
    forecastHorizon,
    lastForecast: forecastSeries.length > 0 ? new Date().toISOString() : undefined,
    forecastDisabledReason,
  });

  return {
    title: topic.title,
    subtitle: topic.description,
    unitSuffix,
    decimals: topic.decimals ?? 0,
    sourceUrl: topic.sourceUrl,
    series,
    periods,
    extraDimensions,
    availableGeos,
    forecastDisabledReason,
  };
}
