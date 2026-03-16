import fetch from 'node-fetch';

async function main() {
  console.log('dump-yth-demo-070-dims starting');
  const url = new URL('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_070');
  url.searchParams.set('lang', 'en');

  const res = await fetch(url);
  const data = await res.json();

  const dims = data.dimension;
  const keys = Object.keys(dims);
  console.log('dimensions:', keys);
  for (const key of keys) {
    const dim = dims[key];
    const idx = dim.category.index;
    const labels = dim.category.label;
    const count = Array.isArray(idx) ? idx.length : Object.keys(idx).length;
    console.log(`- ${key}: ${count} values (sample:`, Array.isArray(idx) ? idx.slice(0,5) : Object.keys(idx).slice(0,5), ')');
  }

  console.log('OBS count (annotation):', (data.extension.annotation || []).find((a) => a.type === 'OBS_COUNT')?.title);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
