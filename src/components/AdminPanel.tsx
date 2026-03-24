import { useEffect, useMemo, useState } from 'react';
import type { TopicDefinition } from '../features/dashboard/types';
import { BackendStatusSummary } from './admin/BackendStatusSummary';
import { DefaultChartsSection } from './admin/DefaultChartsSection';
import { FetchStatsSection } from './admin/FetchStatsSection';
import { readStats, type FetchStats } from './admin/adminStats';
import { loadCatalogEntries, type CatalogEntry } from '../lib/catalog';

export type AdminPanelProps = {
  defaultTopicIds: string[];
  setDefaultTopicIds: React.Dispatch<React.SetStateAction<string[]>>;
  defaultChartGeoValuesByTopicId: Record<string, string[]>;
  setDefaultChartGeoValuesByTopicId: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  backendMode: 'checking' | 'go' | 'local';
  backendStatusMessage: string;
  backendBaseUrl: string;
  onRefreshBackendStatus: () => void;
  isRefreshingBackendStatus: boolean;
  topics: TopicDefinition[];
  topicMap: Record<string, TopicDefinition>;
  defaultBuiltInTopicIds: string[];
  catalogPath: string;
  onLoadDefaults: () => void;
  onClearDashboard: () => void;
  onClose: () => void;
};

export function AdminPanel({
  defaultTopicIds,
  setDefaultTopicIds,
  defaultChartGeoValuesByTopicId,
  setDefaultChartGeoValuesByTopicId,
  backendMode,
  backendStatusMessage,
  backendBaseUrl,
  onRefreshBackendStatus,
  isRefreshingBackendStatus,
  topics,
  topicMap,
  defaultBuiltInTopicIds,
  catalogPath,
  onLoadDefaults,
  onClearDashboard,
  onClose,
}: AdminPanelProps) {
  const [stats, setStats] = useState<FetchStats>(() => readStats());
  const [selectedTopicId, setSelectedTopicId] = useState(defaultTopicIds[0] ?? topics[0]?.id ?? '');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [customCode, setCustomCode] = useState('');
  const suggestions = useMemo(
    () =>
      catalog
        .filter((entry) => {
          const search = customCode.trim().toLowerCase();
          if (!search) return false;
          return entry.code.toLowerCase().includes(search) || entry.title.toLowerCase().includes(search);
        })
        .slice(0, 10),
    [catalog, customCode],
  );

  useEffect(() => {
    const listener = () => setStats(readStats());
    window.addEventListener('dashboard:stats-updated', listener);
    return () => window.removeEventListener('dashboard:stats-updated', listener);
  }, []);

  useEffect(() => {
    loadCatalogEntries(catalogPath)
      .then((entries) => setCatalog(entries))
      .catch(() => {
        /* ignore */
      });
  }, [catalogPath]);

  useEffect(() => {
    if (selectedTopicId && topicMap[selectedTopicId]) {
      return;
    }

    setSelectedTopicId(defaultTopicIds[0] ?? topics[0]?.id ?? '');
  }, [defaultTopicIds, selectedTopicId, topicMap, topics]);

  const handleAddDefault = () => {
    if (!selectedTopicId) return;
    setDefaultTopicIds((existing) => Array.from(new Set([...existing, selectedTopicId])));
  };

  const handleAddDefaultByCode = (code: string) => {
    if (!code) return;
    setDefaultTopicIds((existing) => Array.from(new Set([...existing, code])));
  };

  const handleRemoveDefault = (topicId: string) => {
    setDefaultTopicIds((existing) => existing.filter((id) => id !== topicId));
    setDefaultChartGeoValuesByTopicId((existing) => {
      if (!(topicId in existing)) return existing;
      const next = { ...existing };
      delete next[topicId];
      return next;
    });
  };

  const handleResetDefaults = () => {
    setDefaultTopicIds(defaultBuiltInTopicIds);
    setDefaultChartGeoValuesByTopicId({});
  };

  const handleGeoValuesTextChange = (topicId: string, text: string) => {
    const geoValues = text
      .split(',')
      .map((value) => value.trim())
      .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index)
      .slice(0, 12);

    setDefaultChartGeoValuesByTopicId((existing) => {
      if (geoValues.length === 0) {
        if (!(topicId in existing)) return existing;
        const next = { ...existing };
        delete next[topicId];
        return next;
      }
      return {
        ...existing,
        [topicId]: geoValues,
      };
    });
  };

  return (
    <div className="batcave-page min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="batcave-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Admin</div>
            <div className="text-xs text-slate-300">Manage default charts and view dataset fetch stats.</div>
            <BackendStatusSummary
              backendMode={backendMode}
              backendStatusMessage={backendStatusMessage}
              backendBaseUrl={backendBaseUrl}
              onRefreshBackendStatus={onRefreshBackendStatus}
              isRefreshingBackendStatus={isRefreshingBackendStatus}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bat-btn rounded-2xl px-3 py-1 text-xs font-medium"
            >
              Back to dashboard
            </button>
            <button
              type="button"
              onClick={onClearDashboard}
              className="bat-btn bat-btn-danger rounded-2xl px-3 py-1 text-xs font-medium"
            >
              Clear dashboard
            </button>
          </div>
        </section>

        <section className="batcave-panel rounded-2xl px-5 py-5">
          <h2 className="text-sm font-semibold text-white">Default charts</h2>
          <p className="mt-1 text-xs text-slate-300">
            Charts in this list are automatically added to the dashboard when it’s empty.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DefaultChartsSection
              defaultTopicIds={defaultTopicIds}
              defaultChartGeoValuesByTopicId={defaultChartGeoValuesByTopicId}
              topics={topics}
              topicMap={topicMap}
              selectedTopicId={selectedTopicId}
              onSelectedTopicIdChange={setSelectedTopicId}
              customCode={customCode}
              onCustomCodeChange={setCustomCode}
              suggestions={suggestions}
              onAddDefault={handleAddDefault}
              onAddDefaultByCode={handleAddDefaultByCode}
              onRemoveDefault={handleRemoveDefault}
              onGeoValuesTextChange={handleGeoValuesTextChange}
              onResetDefaults={handleResetDefaults}
              onLoadDefaults={onLoadDefaults}
            />

            <FetchStatsSection stats={stats} topics={topics} onRefresh={() => setStats(readStats())} />
          </div>
        </section>
      </div>
    </div>
  );
}
