// ESM script: uses built-in fetch (Node 18+)

const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_070?lang=en&unit=NR&geo=DE&c_birth=AFR&agedef=COMPLET&sex=TOTAL';
console.log('fetching', url);

const res = await fetch(url);
const js = await res.json();

const { id: ids, size: sizes, dimension } = js;

const getDimensionInfo = () => {
  return ids.map((dim) => {
    const cat = dimension[dim].category;
    const index = cat.index;
    const codes = Array.isArray(index)
      ? index
      : Object.entries(index).sort((a, b) => a[1] - b[1]).map(([code]) => code);
    const labels = cat.label || {};
    return { id: dim, codes, labels };
  });
};

const dims = getDimensionInfo();
const timeDim = dims.find((d) => /time/i.test(d.id)) || dims[dims.length - 1];
const geoDim = dims.find((d) => d.id.toLowerCase() === 'geo');
const seriesDim = dims.find((d) => d.id === 'age');

const timeIndex = dims.findIndex((d) => d.id === timeDim.id);
const geoIndex = geoDim ? dims.findIndex((d) => d.id === geoDim.id) : -1;
const seriesIndex = seriesDim ? dims.findIndex((d) => d.id === seriesDim.id) : -1;

const unravel = (flatIndex, sizes) => {
  const coords = [];
  let r = flatIndex;
  for (let i = sizes.length - 1; i >= 0; i -= 1) {
    coords[i] = r % sizes[i];
    r = Math.floor(r / sizes[i]);
  }
  return coords;
};

const values = js.value;
const items = Array.isArray(values)
  ? values.map((v, i) => [i, v])
  : Object.entries(values).map(([k, v]) => [Number(k), v]);

const seriesMap = new Map();

for (const [flatIndex, raw] of items) {
  if (raw == null) continue;
  const v = Number(raw);
  if (Number.isNaN(v)) continue;

  const coords = unravel(flatIndex, sizes);
  const periodCode = timeDim.codes[coords[timeIndex]];
  const geoCode = geoDim ? geoDim.codes[coords[geoIndex]] : '??';
  const geoLabel = geoDim ? geoDim.labels[geoCode] || geoCode : geoCode;

  let label = geoLabel;
  if (seriesDim && seriesIndex >= 0) {
    const seriesCode = seriesDim.codes[coords[seriesIndex]];
    const seriesLabel = seriesDim.labels[seriesCode] || seriesCode;
    label = `${geoLabel} — ${seriesLabel}`;
  }

  if (!seriesMap.has(label)) seriesMap.set(label, []);
  seriesMap.get(label).push({ periodCode, value: v });
}

console.log('series count', seriesMap.size);
for (const [label, points] of seriesMap) {
  const uniquePeriods = new Set(points.map((p) => p.periodCode));
  console.log(label, 'points', points.length, 'unique periods', uniquePeriods.size);
  // Show first few
  console.log('  sample', points.slice(0, 8));
}

console.log('dimensions:', ids);
console.log('sizes:', sizes);

// show agedef options
const ageDefDim = js.dimension.agedef;
if (ageDefDim) {
  const idx = ageDefDim.category.index;
  const labels = ageDefDim.category.label || {};
  const codes = Array.isArray(idx)
    ? idx
    : Object.entries(idx).sort((a, b) => a[1] - b[1]).map(([code]) => code);
  console.log('agedef codes:', codes);
  console.log('agedef labels sample:', codes.slice(0, 10).map((c) => ({ code: c, label: labels[c] })));
}
