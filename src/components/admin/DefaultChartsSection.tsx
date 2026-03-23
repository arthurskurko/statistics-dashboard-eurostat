import { CatalogCodeSearch } from '../CatalogCodeSearch';
import { TOPIC_MAP, TOPICS } from '../../features/dashboard/topicCatalog';
import type { TopicDefinition } from '../../features/dashboard/types';
import type { CatalogEntry } from '../../lib/catalog';

type DefaultChartsSectionProps = {
  defaultTopicIds: string[];
  selectedTopicId: string;
  onSelectedTopicIdChange: (topicId: string) => void;
  customCode: string;
  onCustomCodeChange: (code: string) => void;
  suggestions: CatalogEntry[];
  onAddDefault: () => void;
  onAddDefaultByCode: (code: string) => void;
  onRemoveDefault: (topicId: string) => void;
  onResetDefaults: () => void;
  onLoadDefaults: () => void;
};

function mapDefaultTopics(defaultTopicIds: string[]): TopicDefinition[] {
  return defaultTopicIds
    .map((id) =>
      TOPIC_MAP[id] ?? {
        id,
        title: id,
        description: id,
        datasetCode: id,
        filters: {},
        sourceUrl: '',
        pubmed: {
          availability: 'unchecked',
          searchTerm: id,
        },
      },
    )
    .filter(Boolean) as TopicDefinition[];
}

export function DefaultChartsSection({
  defaultTopicIds,
  selectedTopicId,
  onSelectedTopicIdChange,
  customCode,
  onCustomCodeChange,
  suggestions,
  onAddDefault,
  onAddDefaultByCode,
  onRemoveDefault,
  onResetDefaults,
  onLoadDefaults,
}: DefaultChartsSectionProps) {
  const defaultTopics = mapDefaultTopics(defaultTopicIds);

  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Current defaults</h3>
      {defaultTopics.length === 0 ? (
        <p className="mt-2 text-xs text-slate-200">No default charts configured.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {defaultTopics.map((topic) => (
            <li key={topic.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
              <span className="text-xs text-slate-200">{topic.title}</span>
              <button
                type="button"
                onClick={() => onRemoveDefault(topic.id)}
                className="text-xs text-rose-200 hover:text-rose-100"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={selectedTopicId}
          onChange={(event) => onSelectedTopicIdChange(event.target.value)}
          className="bat-input w-full rounded-2xl px-3 py-2 text-sm text-white outline-none"
        >
          {TOPICS.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAddDefault}
          className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
        >
          Add
        </button>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Add from catalog</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CatalogCodeSearch
            customCode={customCode}
            onCustomCodeChange={onCustomCodeChange}
            suggestions={suggestions}
            addButtonClassName="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
            onSuggestionSelect={(code) => {
              onCustomCodeChange(code);
              onSelectedTopicIdChange(code);
              onAddDefaultByCode(code);
            }}
            onAddByCode={(code) => {
              onSelectedTopicIdChange(code);
              onAddDefaultByCode(code);
              onCustomCodeChange('');
            }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onResetDefaults}
          className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
        >
          Restore built-in defaults
        </button>
        <button
          type="button"
          onClick={onLoadDefaults}
          className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
        >
          Load defaults now
        </button>
      </div>
    </div>
  );
}