export type CatalogEntry = {
  code: string;
  title: string;
  raw?: Record<string, unknown>;
};

export function normalizeCatalogEntry(item: unknown): CatalogEntry | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;

  const code =
    (typeof record.code === 'string' && record.code) ||
    (typeof record.datasetCode === 'string' && record.datasetCode) ||
    (typeof record.id === 'string' && record.id) ||
    '';

  const title =
    (typeof record.title === 'string' && record.title) ||
    (typeof record.name === 'string' && record.name) ||
    (typeof record.display_name === 'string' && record.display_name) ||
    code;

  if (!code) return null;
  return { code, title, raw: record };
}

export function parseCatalogEntries(payload: unknown): CatalogEntry[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map(normalizeCatalogEntry)
    .filter((entry): entry is CatalogEntry => entry !== null);
}

export async function loadCatalogEntries(path: string): Promise<CatalogEntry[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Catalog request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return parseCatalogEntries(payload);
}
