import type { DataSeries, TopicData } from '../../features/dashboard/types';

export type DimensionOption = NonNullable<TopicData['extraDimensions']>[number];

export const FRIENDLY_DIMENSION_LABELS: Record<string, string> = {
  sex: 'Sex',
  age: 'Age',
  unit: 'Unit',
  freq: 'Frequency',
  agedef: 'Age definition',
  c_birth: 'Birth cohort',
  s_adj: 'Seasonal adjustment',
  coicop: 'COICOP',
  ord_brth: 'Order of birth',
};

export const KNOWN_GEOS: Array<{ code: string; label: string }> = [
  { code: 'EE', label: 'Estonia' },
  { code: 'EU27_2020', label: 'European Union - 27 countries (from 2020)' },
  { code: 'BE', label: 'Belgium' },
  { code: 'BG', label: 'Bulgaria' },
  { code: 'CZ', label: 'Czechia' },
  { code: 'DK', label: 'Denmark' },
  { code: 'DE', label: 'Germany' },
  { code: 'DE_TOT', label: 'Germany including former GDR' },
  { code: 'IE', label: 'Ireland' },
  { code: 'ES', label: 'Spain' },
  { code: 'FR', label: 'France' },
  { code: 'FX', label: 'Metropolitan France' },
  { code: 'HR', label: 'Croatia' },
  { code: 'IT', label: 'Italy' },
  { code: 'LV', label: 'Latvia' },
  { code: 'LT', label: 'Lithuania' },
  { code: 'HU', label: 'Hungary' },
  { code: 'PL', label: 'Poland' },
  { code: 'PT', label: 'Portugal' },
  { code: 'RO', label: 'Romania' },
  { code: 'SI', label: 'Slovenia' },
  { code: 'SK', label: 'Slovakia' },
  { code: 'FI', label: 'Finland' },
  { code: 'SE', label: 'Sweden' },
  { code: 'IS', label: 'Iceland' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'UK', label: 'United Kingdom' },
  { code: 'ME', label: 'Montenegro' },
  { code: 'MD', label: 'Moldova' },
  { code: 'GE', label: 'Georgia' },
  { code: 'AL', label: 'Albania' },
  { code: 'RS', label: 'Serbia' },
  { code: 'UA', label: 'Ukraine' },
  { code: 'BY', label: 'Belarus' },
  { code: 'RU', label: 'Russia' },
  { code: 'SM', label: 'San Marino' },
  { code: 'AM', label: 'Armenia' },
  { code: 'AZ', label: 'Azerbaijan' },
  { code: 'PS', label: 'Palestine' },
];

export function friendlyDimensionLabel(id: string): string {
  if (FRIENDLY_DIMENSION_LABELS[id]) return FRIENDLY_DIMENSION_LABELS[id];
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function findDimensionValueLabel(
  dimensions: DimensionOption[],
  dimId: string,
  code: string,
): string {
  const dim = dimensions.find((d) => d.id === dimId);
  if (!dim) return code;
  return dim.values.find((v) => v.code === code)?.label ?? code;
}

export function formatValue(value: number, decimals: number, unitSuffix?: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });

  if (unitSuffix === '€') {
    return `${formatter.format(value)} ${unitSuffix}`;
  }

  return unitSuffix ? `${formatter.format(value)}${unitSuffix}` : formatter.format(value);
}

export function computeLatestValues(
  series: DataSeries[],
  activeFilterLabels: string[],
): Array<{ label: string; point: DataSeries['points'][number] }> {
  const filterSuffix = activeFilterLabels.length > 0 ? ` (${activeFilterLabels.join(', ')})` : '';

  return series
    .filter((entry) => !entry.label.includes('(forecast)'))
    .map((entry) => {
      const nonForecastPoints = entry.points.filter((point) => !point.predicted);
      return {
        label: `${entry.label}${filterSuffix}`,
        point: nonForecastPoints.at(-1) ?? entry.points.at(-1),
      };
    })
    .filter(
      (entry): entry is { label: string; point: DataSeries['points'][number] } => Boolean(entry.point),
    );
}
