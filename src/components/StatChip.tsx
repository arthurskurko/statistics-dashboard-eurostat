import type { ReactNode } from 'react';

type StatChipProps = {
  label: string;
  value: ReactNode;
};

export function StatChip({ label, value }: StatChipProps) {
  return (
    <div className="rounded-2xl border border-border bg-white/5 px-4 py-3 shadow-card backdrop-blur-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}
