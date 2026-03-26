import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { GlobalMusicTransport } from './GlobalMusicTransport';
import { StatChip } from './StatChip';
import { THEMES, type ThemeId } from '../features/dashboard/themes';

type ProviderId = 'eurostat' | 'worldbank' | 'who' | 'openmeteo';

type NavItem = {
  id: ProviderId;
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'eurostat', label: 'Eurostat', href: '' },
  { id: 'worldbank', label: 'World Bank', href: 'worldbank' },
  { id: 'who', label: 'WHO', href: 'who' },
  { id: 'openmeteo', label: 'Open-Meteo', href: 'meteo' },
];

type ProviderDashboardLayoutProps<T extends { id: string }> = {
  basePath: string;
  currentProvider: ProviderId;
  themeId: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
  headerExtra?: ReactNode;
  picker: ReactNode;
  stats: Array<{ label: string; value: string | number }>;
  cards: T[];
  renderCard: (card: T) => ReactNode;
};

export function ProviderDashboardLayout<T extends { id: string }>({
  basePath,
  currentProvider,
  themeId,
  onThemeChange,
  headerExtra,
  picker,
  stats,
  cards,
  renderCard,
}: ProviderDashboardLayoutProps<T>) {
  return (
    <div className="batcave-page min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="batcave-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-300">Interface theme</div>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <span className="text-slate-300">Mode</span>
            <select
              value={themeId}
              onChange={(event) => onThemeChange(event.target.value as ThemeId)}
              className="bat-input rounded-xl px-3 py-2 text-sm text-white outline-none"
            >
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex w-full flex-wrap items-center gap-2 text-xs sm:w-auto">
            <a href={`${basePath}dashboard`} className="bat-btn whitespace-nowrap rounded-2xl px-3 py-1 font-medium">
              Unified
            </a>
            {NAV_ITEMS.map((item) => {
              if (item.id === currentProvider) {
                return (
                  <span key={item.id} className="whitespace-nowrap rounded-2xl border border-white/20 bg-white/10 px-3 py-1 font-medium text-white">
                    {item.label}
                  </span>
                );
              }

              return (
                <a key={item.id} href={`${basePath}${item.href}`} className="bat-btn whitespace-nowrap rounded-2xl px-3 py-1 font-medium">
                  {item.label}
                </a>
              );
            })}
          </div>

          {headerExtra}
        </section>

        {picker}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <StatChip key={item.label} label={item.label} value={item.value} />
          ))}
        </section>

        {cards.length === 0 ? <EmptyState /> : null}

        {cards.length > 0 ? (
          <section className="grid gap-6 xl:grid-cols-2">
            {cards.map((card) => renderCard(card))}
          </section>
        ) : null}
      </div>
      <GlobalMusicTransport />

      <div className="fixed right-4 top-4 z-50">
        <div className="group relative">
          <button
            type="button"
            aria-label="Tech stack info"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-slate-900/80 text-sm font-semibold text-white backdrop-blur transition hover:bg-slate-800"
          >
            i
          </button>
          <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-white/20 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 opacity-0 shadow-lg transition duration-200 group-hover:opacity-100">
            Built with React, TypeScript, Vite, Tailwind CSS, ECharts, React Query, Python (forecast scripts), and a Node/Go backend (Eurostat+WHO+WorldBank/Open-Meteo data).
          </div>
        </div>
      </div>
    </div>
  );
}
