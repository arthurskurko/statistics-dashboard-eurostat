import { formatValue } from './helpers';

type LatestValuesGridProps = {
  latestValues: Array<{ label: string; point: { value: number; label: string } }>;
  decimals: number;
  unitSuffix?: string;
};

export function LatestValuesGrid({ latestValues, decimals, unitSuffix }: LatestValuesGridProps) {
  if (latestValues.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {latestValues.map(({ label, point }) => (
        <div key={label} className="rounded-2xl border border-border bg-white/5 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Latest - {label}</div>
          <div className="mt-2 text-xl font-semibold text-white">
            {formatValue(point.value, decimals, unitSuffix)}
          </div>
          <div className="mt-1 text-sm text-slate-300">{point.label}</div>
        </div>
      ))}
    </div>
  );
}
