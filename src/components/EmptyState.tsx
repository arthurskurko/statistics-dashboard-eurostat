export function EmptyState() {
  return (
    <section className="rounded-3xl border border-dashed border-border bg-slate-900/50 p-10 text-center shadow-card backdrop-blur-sm">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Start building</div>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">No charts yet</h2>
        <p className="text-sm leading-7 text-slate-300 sm:text-base">
          Pick a topic such as population, inflation, unemployment, or GDP per capita and add it to the
          dashboard. You can add multiple charts and remove them independently.
        </p>
      </div>
    </section>
  );
}
