import { CatalogCodeSearch } from '../CatalogCodeSearch';
import TopicGeoInput from './TopicGeoInput';
import type { TopicDefinition } from '../../features/dashboard/types';
import type { CatalogEntry } from '../../lib/catalog';

type DefaultChartsSectionProps = {
  defaultTopicIds: string[];
  defaultChartGeoValuesByTopicId: Record<string, string[]>;
  topics: TopicDefinition[];
  topicMap: Record<string, TopicDefinition>;
  providerId: 'eurostat' | 'worldbank' | 'who' | 'openmeteo';
  selectedTopicId: string;
  onSelectedTopicIdChange: (topicId: string) => void;
  customCode: string;
  onCustomCodeChange: (code: string) => void;
  catalog: CatalogEntry[];
  suggestions: CatalogEntry[];
  onAddDefault: () => void;
  onAddDefaultByCode: (code: string) => void;
  onRemoveDefault: (topicId: string) => void;
  onGeoValuesTextChange: (topicId: string, text: string) => void;
  onResetDefaults: () => void;
  onLoadDefaults: () => void;
  onExportDefaults?: () => void;
  onImportDefaults?: (file: File | null) => void;
};

function mapDefaultTopics(
  defaultTopicIds: string[],
  topicMap: Record<string, TopicDefinition>,
  catalog: CatalogEntry[],
): TopicDefinition[] {
  const uniqueTopicIds = Array.from(new Set(defaultTopicIds));

  return uniqueTopicIds
    .map((id) => {
      const existing = topicMap[id];
      if (existing) return existing;

      const catalogEntry = catalog.find((entry) => entry.code === id);
      if (catalogEntry) {
        return {
          id,
          title: catalogEntry.title,
          description: catalogEntry.title,
          datasetCode: id,
          filters: {},
          sourceUrl: '',
          pubmed: {
            availability: 'unchecked',
            searchTerm: catalogEntry.title,
          },
        };
      }

      return {
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
      };
    })
    .filter((topic, index, arr) => 
      arr.findIndex((t) => t.datasetCode === topic.datasetCode) === index,
    ) as TopicDefinition[];
}

export function DefaultChartsSection({
  defaultTopicIds,
  defaultChartGeoValuesByTopicId,
  topics,
  topicMap,
  catalog,
  providerId,
  selectedTopicId,
  onSelectedTopicIdChange,
  customCode,
  onCustomCodeChange,
  suggestions,
  onAddDefault,
  onAddDefaultByCode,
  onRemoveDefault,
  onGeoValuesTextChange,
  onResetDefaults,
  onLoadDefaults,
  onExportDefaults,
  onImportDefaults,
}: DefaultChartsSectionProps) {
  const defaultTopics = mapDefaultTopics(defaultTopicIds, topicMap, catalog);

  

  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Current defaults</h3>
      {defaultTopics.length === 0 ? (
        <p className="mt-2 text-xs text-slate-200">No default charts configured.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {defaultTopics.map((topic) => (
            <li key={topic.id} className="rounded-xl bg-white/5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-200">{topic.title}</span>
                <button
                  type="button"
                  onClick={() => onRemoveDefault(topic.id)}
                  className="text-xs text-rose-200 hover:text-rose-100"
                >
                  Remove
                </button>
              </div>
                <div className="mt-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">Default geos</span>
                  <TopicGeoInput
                    providerId={providerId}
                    topic={topic}
                    topicMap={topicMap}
                    value={Array.isArray(defaultChartGeoValuesByTopicId[topic.id]) ? defaultChartGeoValuesByTopicId[topic.id] : []}
                    onChange={(values) => onGeoValuesTextChange(topic.id, values.join(', '))}
                  />
                </div>
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
          {topics.map((topic) => (
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
        <button
          type="button"
          onClick={() => onExportDefaults && onExportDefaults()}
          className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium"
        >
          Export defaults
        </button>
        <label className="bat-btn rounded-2xl px-3 py-2 text-xs font-medium cursor-pointer">
          Import defaults
          <input
            type="file"
            accept="application/json"
            onChange={(e) => onImportDefaults && onImportDefaults(e.target.files ? e.target.files[0] : null)}
            style={{ display: 'none' }}
          />
        </label>
      </div>
    </div>
  );
}