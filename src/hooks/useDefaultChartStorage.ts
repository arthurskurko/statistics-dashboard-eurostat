import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocalStorage } from './useLocalStorage';

export type BackendMode = 'checking' | 'go' | 'local';

type BackendDefaultChartResponse = {
  topicIds?: string[];
};

type UseDefaultChartStorageOptions = {
  storageKey: string;
  initialTopicIds: string[];
  backendBaseUrl: string;
  userId: string;
  dashboard: string;
};

type UseDefaultChartStorageResult = {
  defaultTopicIds: string[];
  setDefaultTopicIds: Dispatch<SetStateAction<string[]>>;
  defaultChartGeoValuesByTopicId: Record<string, string[]>;
  setDefaultChartGeoValuesByTopicId: Dispatch<SetStateAction<Record<string, string[]>>>;
  backendMode: BackendMode;
  backendStatusMessage: string;
  isCheckingBackend: boolean;
  refreshBackendStatus: () => Promise<void>;
};

function normalizeTopicIds(topicIds: string[]): string[] {
  return Array.from(
    new Set(
      topicIds
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

export function useDefaultChartStorage({
  storageKey,
  initialTopicIds,
  backendBaseUrl,
  userId,
  dashboard,
}: UseDefaultChartStorageOptions): UseDefaultChartStorageResult {
  const [defaultTopicIds, setDefaultTopicIds] = useLocalStorage<string[]>(storageKey, initialTopicIds);
  const [defaultChartGeoValuesByTopicId, setDefaultChartGeoValuesByTopicId] = useLocalStorage<Record<string, string[]>>(
    `${storageKey}.templateGeoByTopicId`,
    {},
  );
  const [backendMode, setBackendMode] = useState<BackendMode>('checking');
  const [backendStatusMessage, setBackendStatusMessage] = useState('Checking Go backend...');
  const [isCheckingBackend, setIsCheckingBackend] = useState(false);
  const skipNextBackendSaveRef = useRef(false);

  const refreshBackendStatus = useCallback(async () => {
    setIsCheckingBackend(true);
    setBackendMode('checking');
    setBackendStatusMessage('Checking Go backend...');

    try {
      const healthResponse = await fetch(`${backendBaseUrl}/api/health`);
      if (!healthResponse.ok) {
        throw new Error(`Health endpoint returned ${healthResponse.status}`);
      }

      const params = new URLSearchParams({ userId, dashboard });
      const defaultsResponse = await fetch(`${backendBaseUrl}/api/default-charts?${params.toString()}`);
      if (!defaultsResponse.ok) {
        throw new Error(`Default charts endpoint returned ${defaultsResponse.status}`);
      }

      const payload = (await defaultsResponse.json()) as BackendDefaultChartResponse;
      const remoteTopicIds = Array.isArray(payload.topicIds)
        ? payload.topicIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];

      setBackendMode('go');
      setBackendStatusMessage(`Connected to Go backend at ${backendBaseUrl}`);

      // Backend is authoritative when reachable, including an intentionally empty list.
      skipNextBackendSaveRef.current = true;
      setDefaultTopicIds(normalizeTopicIds(remoteTopicIds));
    } catch (error) {
      setBackendMode('local');
      const message = error instanceof Error ? error.message : 'Unknown error';
      setBackendStatusMessage(`Using browser local storage (backend unavailable: ${message})`);
    } finally {
      setIsCheckingBackend(false);
    }
  }, [backendBaseUrl, dashboard, setDefaultTopicIds, userId]);

  const saveDefaultsToBackend = useCallback(
    async (topicIds: string[]) => {
      const response = await fetch(`${backendBaseUrl}/api/default-charts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          dashboard,
          topicIds,
        }),
      });

      if (!response.ok) {
        throw new Error(`Save endpoint returned ${response.status}`);
      }
    },
    [backendBaseUrl, dashboard, userId],
  );

  useEffect(() => {
    setDefaultTopicIds((current) => {
      const normalized = normalizeTopicIds(current);
      if (normalized.length === current.length && normalized.every((value, index) => value === current[index])) {
        return current;
      }
      return normalized;
    });
  }, [setDefaultTopicIds]);

  useEffect(() => {
    void refreshBackendStatus();
  }, [refreshBackendStatus]);

  useEffect(() => {
    if (backendMode !== 'go') {
      return;
    }

    if (skipNextBackendSaveRef.current) {
      skipNextBackendSaveRef.current = false;
      return;
    }

    void saveDefaultsToBackend(defaultTopicIds).catch((error: unknown) => {
      setBackendMode('local');
      const message = error instanceof Error ? error.message : 'Unknown error';
      setBackendStatusMessage(`Fell back to browser local storage (save failed: ${message})`);
    });
  }, [backendMode, defaultTopicIds, saveDefaultsToBackend]);

  return {
    defaultTopicIds,
    setDefaultTopicIds,
    defaultChartGeoValuesByTopicId,
    setDefaultChartGeoValuesByTopicId,
    backendMode,
    backendStatusMessage,
    isCheckingBackend,
    refreshBackendStatus,
  };
}