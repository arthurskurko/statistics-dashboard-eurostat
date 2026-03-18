import type { ReactNode } from 'react';

type StatChipProps = {
  label: string;
  value: ReactNode;
};

export function StatChip({ label, value }: StatChipProps) {
  return (
    <div className="bat-stat rounded-2xl px-4 py-3 shadow-card backdrop-blur-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}
