const fs = require('fs');
const path = require('path');

const URL = 'https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt?lang=en';

function unquote(value) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split('\t').map((h) => unquote(h.trim()));
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split('\t');
    if (parts.length !== headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = unquote(parts[j].trim());
    }
    rows.push(row);
  }

  return rows;
}

(async function main() {
  console.log('Fetching Eurostat catalogue...');
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch catalogue: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const rows = parseTsv(text);

  const datasets = rows
    .filter((r) => r.type?.toLowerCase() === 'table')
    .map((r) => ({
      code: r.code,
      title: r.title,
      description: r.title,
      lastUpdate: r['last update of data'] || '',
      start: r['data start'] || '',
      end: r['data end'] || '',
    }));

  const outDir = path.join('public');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(datasets, null, 2));

  console.log('Wrote', datasets.length, 'datasets to public/catalog.json');
})();
