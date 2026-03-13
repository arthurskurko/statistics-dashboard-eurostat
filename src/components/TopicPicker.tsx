import { useEffect, useState } from 'react';
import { TOPICS } from '../features/dashboard/topicCatalog';

type TopicPickerProps = {
  selectedTopicId: string;
  onSelectedTopicIdChange: (topicId: string) => void;
  onAddTopic: () => void;
  onAddTopicById: (topicId: string) => void;
  onClear: () => void;
  chartCount: number;
};

type CatalogEntry = {
  code: string;
  title: string;
};

export function TopicPicker({
  selectedTopicId,
  onSelectedTopicIdChange,
  onAddTopic,
  onAddTopicById,
  onClear,
  chartCount,
}: TopicPickerProps) {
  const [customCode, setCustomCode] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);

  const searchLower = customCode.trim().toLowerCase();
  const suggestions = Array.from(
    new Map(
      catalog
        .filter((entry) =>
          searchLower.length > 0
            ? entry.code.toLowerCase().includes(searchLower) || entry.title.toLowerCase().includes(searchLower)
            : false,
        )
        // Use the code as unique key — prevents duplicates in the suggestion list.
        .map((entry) => [entry.code, entry]),
    ).values(),
  ).slice(0, 10);

  useEffect(() => {
    fetch('/catalog.json')
      .then((res) => res.json())
      .then((data) => setCatalog(data))
      .catch(() => {
        /* ignore */
      });
  }, []);

  return (
    <section className="rounded-3xl border border-border bg-slate-900/80 p-6 shadow-card backdrop-blur-xl">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-sky-200">
            Eurostat dashboard builder
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Estonia statistics dashboard
          </h1>
          <p className="text-sm leading-7 text-slate-300 sm:text-base">
            Choose a topic and add it to the dashboard. Each chart pulls live Eurostat data for Estonia,
            with the EU aggregate shown alongside when available.
          </p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-[1fr_auto_auto] xl:max-w-2xl">
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Topic
            <select
              value={selectedTopicId}
              onChange={(event) => onSelectedTopicIdChange(event.target.value)}
              className="h-12 rounded-2xl border border-border bg-slate-950/80 px-4 text-white outline-none transition focus:border-sky-400"
            >
              {TOPICS.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onAddTopic}
            className="h-12 rounded-2xl bg-sky-400 px-5 font-medium text-slate-950 transition hover:bg-sky-300"
          >
            Add chart
          </button>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customCode}
                onChange={(event) => setCustomCode(event.target.value)}
                placeholder="Search catalog or enter code"
                className="h-12 w-40 rounded-2xl border border-border bg-slate-950/80 px-4 text-white outline-none transition focus:border-sky-400"
              />
              <button
                type="button"
                onClick={() => {
                  const code = customCode.trim();
                  if (!code) return;
                  onSelectedTopicIdChange(code);
                  onAddTopicById(code);
                  setCustomCode('');
                }}
                className="h-12 rounded-2xl bg-slate-700 px-4 font-medium text-white transition hover:bg-slate-600"
              >
                Add by code
              </button>
            </div>
            {suggestions.length > 0 ? (
              <div className="rounded-2xl border border-border bg-slate-950/80 p-3 text-sm text-slate-200">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Suggestions</div>
                <ul className="space-y-1">
                  {suggestions.map((entry) => (
                    <li key={entry.code}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomCode(entry.code);
                          onSelectedTopicIdChange(entry.code);
                          onAddTopicById(entry.code);
                        }}
                        className="w-full text-left text-xs transition hover:text-white"
                      >
                        <span className="font-semibold">{entry.code}</span> — {entry.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClear}
            disabled={chartCount === 0}
            className="h-12 rounded-2xl border border-border bg-white/5 px-5 font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </div>
    </section>
  );
}
