(async () => {
  const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tps00207?lang=en&geo=EE&geo=FR&geo=IS';
  const res = await fetch(url);
  console.log('status', res.status);
  const data = await res.json();
  const units = data.dimension?.unit?.category;
  if (!units) {
    console.log('no unit dimension found');
    return;
  }
  const idx = units.index;
  const codes = Array.isArray(idx)
    ? idx
    : Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
  console.log('unit count', codes.length);
  console.log('first 20 units:');
  codes.slice(0, 20).forEach((c, i) => {
    console.log(i, c, units.label?.[c]);
  });
})();
