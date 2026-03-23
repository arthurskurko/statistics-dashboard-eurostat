import { TOPICS } from '../../features/dashboard/topicCatalog';
import { formatRelative, type FetchStats } from './adminStats';

type FetchStatsSectionProps = {
  stats: FetchStats;
  onRefresh: () => void;
};

export function FetchStatsSection({ stats, onRefresh }: FetchStatsSectionProps) {
  const topicRows = TOPICS.map((topic) => {
    const stat = stats[topic.id];
    return (
      <tr key={topic.id} className="border-b border-white/10">
        <td className="px-3 py-2 text-left text-xs text-slate-100">{topic.title}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-200">{formatRelative(stat?.lastFetch)}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-200">{formatRelative(stat?.lastForecast)}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-200">{stat?.forecastHorizon ?? '—'}</td>
        <td className="px-3 py-2 text-xs text-slate-300">{stat?.forecastDisabledReason ?? '—'}</td>
      </tr>
    );
  });

  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Fetch stats</h3>
      <p className="mt-1 text-xs text-slate-200">Last time data was fetched and when a forecast was generated.</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-400">
              <th className="px-3 py-2">Topic</th>
              <th className="px-3 py-2 text-right">Last fetch</th>
              <th className="px-3 py-2 text-right">Last forecast</th>
              <th className="px-3 py-2 text-right">Horizon</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>{topicRows}</tbody>
        </table>
      </div>

      <div className="mt-3 text-right">
        <button
          type="button"
          onClick={onRefresh}
          className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
        >
          Refresh stats
        </button>
      </div>
    </div>
  );
}