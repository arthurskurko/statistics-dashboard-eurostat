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
    <section className="batcave-panel relative z-30 rounded-3xl p-6 shadow-card backdrop-blur-xl">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="pixel-badge inline-flex rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.24em]">
            Eurostat dashboard builder
          </div>
          <h1 className="bat-title text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Estonia statistics dashboard
          </h1>
          <p className="text-sm leading-7 text-slate-300 sm:text-base">
            Choose a topic and add it to the dashboard. Each chart pulls live Eurostat data for Estonia,
            with the EU aggregate shown alongside when available.
          </p>
        </div>

        <div className="w-full xl:max-w-3xl">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex min-w-[16rem] flex-1 flex-col gap-2 text-sm text-slate-300">
                Topic
                <select
                  value={selectedTopicId}
                  onChange={(event) => onSelectedTopicIdChange(event.target.value)}
                  className="bat-input h-12 rounded-2xl px-4 text-white outline-none transition"
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
                className="bat-btn bat-btn-primary h-12 rounded-2xl px-6 font-medium"
              >
                Add chart
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="relative min-w-[16rem] flex-1">
                  <input
                    type="text"
                    value={customCode}
                    onChange={(event) => setCustomCode(event.target.value)}
                    placeholder="Search catalog or enter code"
                    className="bat-input h-12 w-full rounded-2xl px-4 text-white outline-none transition"
                  />

                  {suggestions.length > 0 ? (
                    <div className="bat-suggestions absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-auto rounded-2xl p-3 text-sm text-slate-200 backdrop-blur">
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
                              className="w-full rounded-lg px-2 py-1 text-left text-xs transition hover:bg-white/10 hover:text-white"
                            >
                              <span className="font-semibold">{entry.code}</span> - {entry.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const code = customCode.trim();
                    if (!code) return;
                    onSelectedTopicIdChange(code);
                    onAddTopicById(code);
                    setCustomCode('');
                  }}
                  className="bat-btn h-12 rounded-2xl px-5 font-medium"
                >
                  Add by code
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={chartCount === 0}
                  className="bat-btn h-12 rounded-2xl px-5 font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
