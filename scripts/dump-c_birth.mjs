import fetch from 'node-fetch';

async function main() {
  const url = new URL('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_070');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('sex', 'T');
  url.searchParams.set('age', 'TOTAL');
  url.searchParams.set('c_birth', 'TOTAL');
  url.searchParams.set('geo', 'EE');
  url.searchParams.set('geo', 'EU27_2020');

  const res = await fetch(url);
  const data = await res.json();
  const codes = Object.keys(data.dimension.c_birth.category.index || {});
  console.log('c_birth codes:', codes.slice(0, 20), '... total', codes.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
