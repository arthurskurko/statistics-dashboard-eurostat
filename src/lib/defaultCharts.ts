export type DefaultChartsPayload = {
  topicIds: string[];
  chartDefaultsByTopicId?: Record<string, { geoValues?: string[] }>;
  [key: string]: unknown;
};

function normalizeBasePath(basePath: string): string {
  if (!basePath) return '/';
  const normalized = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return normalized;
}

export function createDefaultChartsCandidateUrls(
  basePath: string,
  dashboard: string,
  userId = 'anonymous',
): string[] {
  const normalizedBase = normalizeBasePath(basePath);

  return [
    `${normalizedBase}dist/default-charts/${dashboard}-${userId}-default-charts.json`,
    `${normalizedBase}dist/default-charts/${dashboard}-anonymous-default-charts.json`,
    `${normalizedBase}dist/default-charts/default-charts.json`,
    `${normalizedBase}default-charts/${dashboard}-${userId}-default-charts.json`,
    `${normalizedBase}default-charts/${dashboard}-anonymous-default-charts.json`,
    `${normalizedBase}default-charts/default-charts.json`,
    `${normalizedBase}${dashboard}-${userId}-default-charts.json`,
    `${normalizedBase}${dashboard}-anonymous-default-charts.json`,
    `${normalizedBase}default-charts.json`,
  ];
}

export async function loadDefaultChartsFromCandidates(
  candidates: string[],
  requestedDashboard: string,
): Promise<DefaultChartsPayload | null> {
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        continue;
      }

      const parsed = (await res.json()) as DefaultChartsPayload;
      if (
        parsed &&
        Array.isArray(parsed.topicIds) &&
        parsed.topicIds.length > 0 &&
        (parsed.dashboard == null || parsed.dashboard === requestedDashboard)
      ) {
        return parsed;
      }
    } catch {
      // ignore and try next
    }
  }

  return null;
}
