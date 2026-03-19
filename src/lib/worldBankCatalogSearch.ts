import type { CatalogEntry } from './catalog';

type WorldBankMeta = {
  page?: number;
  pages?: number;
};

type WorldBankIndicatorTopic = {
  id?: string;
  value?: string;
};

type WorldBankIndicatorRow = {
  id?: string;
  name?: string;
  source?: { id?: string; value?: string };
  sourceNote?: string;
  sourceOrganization?: string;
  topics?: WorldBankIndicatorTopic[];
};

type SearchOptions = {
  limit?: number;
  topicFilter?: string;
};

const WORLD_BANK_BASE = 'https://api.worldbank.org/v2';
const WORLD_BANK_SOURCE_ID = '2';
const WORLD_BANK_PER_PAGE = 500;

let sourceCatalogPromise: Promise<CatalogEntry[]> | null = null;

function normalizeTopicNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const names = raw
    .map((topic) => {
      if (!topic || typeof topic !== 'object') return '';
      const value = (topic as Record<string, unknown>).value;
      return typeof value === 'string' ? value.trim() : '';
    })
    .filter((name) => name.length > 0);

  return Array.from(new Set(names));
}

function normalizeIndicatorRow(row: WorldBankIndicatorRow): CatalogEntry | null {
  const code = typeof row.id === 'string' ? row.id.trim() : '';
  const title = typeof row.name === 'string' ? row.name.trim() : '';

  if (!code) return null;

  const topicNames = normalizeTopicNames(row.topics);
  const sourceId = typeof row.source?.id === 'string' ? row.source.id : '';
  const sourceName = typeof row.source?.value === 'string' ? row.source.value : '';

  return {
    code,
    title: title || code,
    raw: {
      code,
      title: title || code,
      sourceId,
      sourceName,
      sourceNote: row.sourceNote ?? '',
      sourceOrganization: row.sourceOrganization ?? '',
      topics: topicNames.map((topicName) => ({ value: topicName })),
      topicNames,
      apiBacked: true,
    },
  };
}

async function fetchIndicatorPage(page: number): Promise<{ rows: WorldBankIndicatorRow[]; pages: number }> {
  const url = new URL(`${WORLD_BANK_BASE}/sources/${WORLD_BANK_SOURCE_ID}/indicator`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', String(WORLD_BANK_PER_PAGE));
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`World Bank indicator request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as [WorldBankMeta, WorldBankIndicatorRow[]];
  const meta = payload?.[0] ?? {};
  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const pages = Number(meta.pages ?? 1);
  return { rows, pages: Number.isFinite(pages) && pages > 0 ? pages : 1 };
}

async function fetchSourceCatalog(): Promise<CatalogEntry[]> {
  if (sourceCatalogPromise) return sourceCatalogPromise;

  sourceCatalogPromise = (async () => {
    const firstPage = await fetchIndicatorPage(1);
    const allRows = [...firstPage.rows];

    for (let page = 2; page <= firstPage.pages; page += 1) {
      const nextPage = await fetchIndicatorPage(page);
      allRows.push(...nextPage.rows);
    }

    const byCode = new Map<string, CatalogEntry>();
    for (const row of allRows) {
      const entry = normalizeIndicatorRow(row);
      if (!entry) continue;
      if (!byCode.has(entry.code)) {
        byCode.set(entry.code, entry);
      }
    }

    return Array.from(byCode.values()).sort((a, b) => a.title.localeCompare(b.title));
  })();

  return sourceCatalogPromise;
}

function getTopicNames(entry: CatalogEntry): string[] {
  const raw = entry.raw;
  if (!raw || typeof raw !== 'object') return [];

  const directTopicNames = (raw as Record<string, unknown>).topicNames;
  if (Array.isArray(directTopicNames)) {
    const cleaned = directTopicNames
      .map((topic) => (typeof topic === 'string' ? topic.trim() : ''))
      .filter((topic) => topic.length > 0);
    if (cleaned.length > 0) return cleaned;
  }

  const topics = (raw as Record<string, unknown>).topics;
  return normalizeTopicNames(topics);
}

function scoreEntry(entry: CatalogEntry, queryLower: string): number {
  const codeLower = entry.code.toLowerCase();
  const titleLower = entry.title.toLowerCase();
  const raw = entry.raw ?? {};

  const sourceNote = typeof raw.sourceNote === 'string' ? raw.sourceNote.toLowerCase() : '';
  const sourceOrganization =
    typeof raw.sourceOrganization === 'string' ? raw.sourceOrganization.toLowerCase() : '';
  const topicText = getTopicNames(entry)
    .join(' ')
    .toLowerCase();

  let score = 0;
  if (codeLower === queryLower) score += 1000;
  if (codeLower.startsWith(queryLower)) score += 500;
  if (titleLower.startsWith(queryLower)) score += 300;
  if (codeLower.includes(queryLower)) score += 200;
  if (titleLower.includes(queryLower)) score += 180;
  if (topicText.includes(queryLower)) score += 120;
  if (sourceNote.includes(queryLower) || sourceOrganization.includes(queryLower)) score += 60;
  return score;
}

export async function searchWorldBankIndicators(query: string, options?: SearchOptions): Promise<CatalogEntry[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));
  const trimmedQuery = query.trim();
  const queryLower = trimmedQuery.toLowerCase();
  if (!queryLower) return [];

  const topicFilter = options?.topicFilter?.trim().toLowerCase();
  const sourceCatalog = await fetchSourceCatalog();

  const ranked = sourceCatalog
    .map((entry) => {
      const score = scoreEntry(entry, queryLower);
      return { entry, score };
    })
    .filter(({ entry, score }) => {
      if (score === 0) return false;
      if (!topicFilter || topicFilter === 'all') return true;
      return getTopicNames(entry).some((topic) => topic.toLowerCase() === topicFilter);
    })
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(({ entry }) => entry);

  return ranked;
}
