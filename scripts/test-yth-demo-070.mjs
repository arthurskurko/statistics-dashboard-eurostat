import fetch from 'node-fetch';

const urlBase = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_070';

const combos = [
  { sex: 'T', age: 'TOTAL' },
  { sex: 'T', age: '15-19' },
  { sex: 'T', age: '20-24' },
  { sex: 'T', age: '25-29' },
  { sex: 'M', age: 'TOTAL' },
  { sex: 'F', age: 'TOTAL' },
];

const geos = ['EE', 'FR', 'FI', 'SE', 'EU27_2020'];

async function fetchCombo({ sex, age, geo, includeCBirth }) {
  const url = new URL(urlBase);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('sex', sex);
  url.searchParams.set('age', age);
  url.searchParams.set('geo', geo);
  if (includeCBirth) url.searchParams.set('c_birth', 'TOTAL');

  const res = await fetch(url);
  const data = await res.json();

  const valueCount = Array.isArray(data.value) ? data.value.length : Object.keys(data.value).length;
  const dimensionNames = Object.keys(data.dimension);
  const geoCodes = Object.keys(data.dimension.geo.category.index || {});
  const countCbirth = Object.keys(data.dimension.c_birth?.category?.index || {}).length;

  return {
    sex,
    age,
    geo,
    includeCBirth,
    valueCount,
    dimensionNames,
    geoCodes,
    cBirthCount: countCbirth,
  };
}

(async () => {
  for (const combo of combos) {
    for (const geo of geos) {
      const withCbirth = await fetchCombo({ ...combo, geo, includeCBirth: false });
      console.log('NO c_birth', withCbirth);

      const withCbirth2 = await fetchCombo({ ...combo, geo, includeCBirth: true });
      console.log('WITH c_birth', withCbirth2);
    }
  }
})();
