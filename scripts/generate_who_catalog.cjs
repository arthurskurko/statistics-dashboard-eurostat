const fs = require('fs');
const path = require('path');

const WHO_INDICATORS_URL = 'https://ghoapi.azureedge.net/api/Indicator?$format=json';

async function fetchAllWhoIndicatorPages(startUrl) {
  const rows = [];
  let nextUrl = startUrl;

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`WHO catalog request failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    if (Array.isArray(payload?.value)) {
      rows.push(...payload.value);
    }

    nextUrl = typeof payload?.['@odata.nextLink'] === 'string' ? payload['@odata.nextLink'] : null;
  }

  return rows;
}

function normalizeEntry(raw) {
  const code = typeof raw?.IndicatorCode === 'string' ? raw.IndicatorCode.trim() : '';
  const title = typeof raw?.IndicatorName === 'string' ? raw.IndicatorName.trim() : code;

  if (!code) return null;
  return { code, title };
}

async function main() {
  console.log('Fetching WHO indicator catalog...');
  const rows = await fetchAllWhoIndicatorPages(WHO_INDICATORS_URL);

  const byCode = new Map();
  for (const row of rows) {
    const entry = normalizeEntry(row);
    if (!entry) continue;
    if (!byCode.has(entry.code)) {
      byCode.set(entry.code, entry);
    }
  }

  const catalog = [...byCode.values()].sort((a, b) => a.title.localeCompare(b.title));

  const outPath = path.join('public', 'who-catalog.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));

  console.log(`Wrote ${catalog.length} WHO indicators to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
