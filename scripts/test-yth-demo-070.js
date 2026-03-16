const combinations = [];

const sexes = ['T', 'M', 'F'];
const ages = ['TOTAL', '15-19', '20-24', '25-29'];
const birth = ['TOTAL']; // keep small to avoid huge responses
const geos = ['EE', 'FR', 'FI', 'SE'];

for (const sex of sexes) {
  for (const age of ages) {
    for (const geo of geos) {
      combinations.push({ sex, age, geo });
    }
  }
}

async function fetchCombo({ sex, age, geo }) {
  const url = new URL('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_070');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('sex', sex);
  url.searchParams.set('age', age);
  url.searchParams.set('c_birth', 'TOTAL');
  url.searchParams.set('geo', geo);

  const res = await fetch(url);
  const data = await res.json();

  const valueCount = Array.isArray(data.value)
    ? data.value.length
    : Object.keys(data.value).length;

  return {
    sex,
    age,
    geo,
    status: res.status,
    valueCount,
    geoCodes: Object.keys(data.dimension.geo.category.index || {}),
    cBirthCodes: Object.keys(data.dimension.c_birth?.category?.index || {}),
  };
}

(async () => {
  for (const combo of combinations) {
    try {
      const result = await fetchCombo(combo);
      console.log(
        `${combo.geo} | sex=${combo.sex} age=${combo.age} => status=${result.status} values=${result.valueCount} geo=${result.geoCodes.join(',')} c_birth=${result.cBirthCodes.join(',')}`,
      );
    } catch (err) {
      console.error('ERROR', combo, err.message);
    }
  }
})();
