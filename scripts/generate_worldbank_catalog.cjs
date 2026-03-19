const fs = require('fs');
const path = require('path');

const WORLD_BANK_BASE = 'https://api.worldbank.org/v2';
const DEFAULT_SOURCE_ID = '2';
const DEFAULT_PER_PAGE = 500;

function parseArgValue(flagName) {
  const index = process.argv.indexOf(flagName);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function getTopicNames(topics) {
  if (!Array.isArray(topics)) return [];
  const names = topics
    .map((topic) => {
      if (!topic || typeof topic !== 'object') return '';
      const value = topic.value;
      return typeof value === 'string' ? value.trim() : '';
    })
    .filter((name) => name.length > 0);

  return [...new Set(names)];
}

async function fetchIndicatorPage({ sourceId, perPage, page }) {
  const url = new URL(`${WORLD_BANK_BASE}/sources/${sourceId}/indicator`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`World Bank indicator request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const meta = payload?.[0] ?? {};
  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const pages = Number(meta.pages ?? 1);

  return {
    rows,
    pages: Number.isFinite(pages) && pages > 0 ? pages : 1,
    total: Number(meta.total ?? rows.length),
  };
}

function normalizeIndicator(row, sourceId) {
  const code = typeof row?.id === 'string' ? row.id.trim() : '';
  const title = typeof row?.name === 'string' ? row.name.trim() : '';
  if (!code) return null;

  const sourceName =
    typeof row?.source?.value === 'string' && row.source.value.trim().length > 0
      ? row.source.value.trim()
      : `Source ${sourceId}`;
  const topicNames = getTopicNames(row?.topics);

  return {
    code,
    title: title || code,
    sourceId,
    sourceName,
    topicNames,
    topics: topicNames.map((name) => ({ value: name })),
    sourceNote: typeof row?.sourceNote === 'string' ? row.sourceNote : '',
    sourceOrganization: typeof row?.sourceOrganization === 'string' ? row.sourceOrganization : '',
  };
}

async function main() {
  const sourceId = parseArgValue('--source') || DEFAULT_SOURCE_ID;
  const perPageArg = parseArgValue('--per-page');
  const perPage = perPageArg ? Number(perPageArg) : DEFAULT_PER_PAGE;

  if (!Number.isFinite(perPage) || perPage <= 0) {
    throw new Error(`Invalid --per-page value: ${perPageArg}`);
  }

  console.log(`Fetching World Bank indicators for source ${sourceId}...`);
  const firstPage = await fetchIndicatorPage({ sourceId, perPage, page: 1 });
  const rows = [...firstPage.rows];

  for (let page = 2; page <= firstPage.pages; page += 1) {
    const nextPage = await fetchIndicatorPage({ sourceId, perPage, page });
    rows.push(...nextPage.rows);
    if (page % 5 === 0 || page === firstPage.pages) {
      console.log(`Fetched page ${page}/${firstPage.pages}`);
    }
  }

  const byCode = new Map();
  for (const row of rows) {
    const entry = normalizeIndicator(row, sourceId);
    if (!entry) continue;
    if (!byCode.has(entry.code)) {
      byCode.set(entry.code, entry);
    }
  }

  const catalog = [...byCode.values()].sort((a, b) => a.title.localeCompare(b.title));

  const outPath = path.join('public', 'worldbank-catalog.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));

  console.log(`Wrote ${catalog.length} indicators (source total: ${firstPage.total}) to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
