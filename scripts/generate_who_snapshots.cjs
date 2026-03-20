const fs = require('fs');
const path = require('path');

const WHO_BASE = 'https://ghoapi.azureedge.net/api';
const POPULAR_CODES_PATH = path.join('public', 'popular-who.json');
const OUT_DIR = path.join('public', 'who-snapshots');

async function fetchAllPages(startUrl) {
  const rows = [];
  let nextUrl = startUrl;

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`WHO request failed: ${response.status} ${response.statusText} (${nextUrl})`);
    }

    const payload = await response.json();
    if (Array.isArray(payload?.value)) {
      rows.push(...payload.value);
    }

    nextUrl = typeof payload?.['@odata.nextLink'] === 'string' ? payload['@odata.nextLink'] : null;
  }

  return rows;
}

function readPopularCodes() {
  if (!fs.existsSync(POPULAR_CODES_PATH)) {
    throw new Error(`Missing ${POPULAR_CODES_PATH}.`);
  }

  const raw = fs.readFileSync(POPULAR_CODES_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`${POPULAR_CODES_PATH} must be an array.`);
  }

  const deduped = new Set();
  for (const entry of parsed) {
    const code = typeof entry?.code === 'string' ? entry.code.trim() : '';
    if (code) deduped.add(code);
  }

  return [...deduped];
}

function toCountryEntry(row) {
  const code = typeof row?.Code === 'string' ? row.Code.trim().toUpperCase() : '';
  const label = typeof row?.Title === 'string' ? row.Title.trim() : '';
  if (!code || !label) return null;
  return { code, label };
}

async function fetchCountries() {
  const url = `${WHO_BASE}/DIMENSION/COUNTRY/DimensionValues?$format=json&$top=1000`;
  const rows = await fetchAllPages(url);

  const countries = rows
    .map(toCountryEntry)
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));

  // Ensure Europe aggregate is available in pickers.
  if (!countries.find((entry) => entry.code === 'EUR')) {
    countries.unshift({ code: 'EUR', label: 'Europe region' });
  }

  return countries;
}

function normalizeRows(rows) {
  return rows.map((row) => ({
    IndicatorCode: row?.IndicatorCode,
    SpatialDim: row?.SpatialDim,
    SpatialDimType: row?.SpatialDimType,
    TimeDim: row?.TimeDim,
    TimeDimensionValue: row?.TimeDimensionValue,
    NumericValue: row?.NumericValue,
    Value: row?.Value,
    Dim1: row?.Dim1,
    Dim2: row?.Dim2,
    Dim3: row?.Dim3,
  }));
}

async function fetchIndicatorSnapshot(indicatorCode) {
  const encoded = indicatorCode.replace(/'/g, "''");

  const infoUrl = `${WHO_BASE}/Indicator?$format=json&$top=1&$filter=${encodeURIComponent(`IndicatorCode eq '${encoded}'`)}`;
  const infoRows = await fetchAllPages(infoUrl);
  const title = typeof infoRows?.[0]?.IndicatorName === 'string' ? infoRows[0].IndicatorName : indicatorCode;

  const dataUrl = `${WHO_BASE}/${indicatorCode}?$format=json&$top=1000`;
  const dataRows = await fetchAllPages(dataUrl);

  return {
    code: indicatorCode,
    title,
    rows: normalizeRows(dataRows),
  };
}

async function main() {
  const codes = readPopularCodes();
  if (codes.length === 0) {
    throw new Error('No WHO indicator codes found in public/popular-who.json');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const entry of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      fs.unlinkSync(path.join(OUT_DIR, entry.name));
    }
  }

  console.log(`Generating WHO snapshots for ${codes.length} indicator(s)...`);

  const countries = await fetchCountries();
  const indicators = [];

  for (const code of codes) {
    console.log(`  - ${code}`);
    const snapshot = await fetchIndicatorSnapshot(code);
    const outPath = path.join(OUT_DIR, `${encodeURIComponent(code)}.json`);
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
    indicators.push({ code, title: snapshot.title, rowCount: snapshot.rows.length });
  }

  const index = {
    generatedAt: new Date().toISOString(),
    countries,
    indicators,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));

  const zeroRowCount = indicators.filter((entry) => (entry.rowCount ?? 0) === 0).length;
  if (zeroRowCount > 0) {
    console.log(`${zeroRowCount} indicator(s) returned zero rows (kept in configured topic list).`);
  }

  console.log(`Wrote WHO snapshots to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
