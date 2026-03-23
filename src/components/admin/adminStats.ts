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

export function formatRelative(dateIso: string | undefined): string {
  if (!dateIso) return '—';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '—';

  const deltaSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function readStats(): FetchStats {
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FetchStats;
  } catch {
    return {};
  }
}