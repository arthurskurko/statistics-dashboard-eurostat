const fetch = (...args) => import('node-fetch').then(m=>m.default(...args));
(async() => {
  for (const code of ['NCD_BMI_30A', 'NCD_DIABETES_PREVALENCE_AGESTD', 'WHOSIS_000001', 'SDGTOBACCO']) {
    const url = `https://ghoapi.azureedge.net/api/${code}?$format=json&$top=1`;
    const r = await fetch(url);
    const d = await r.json();
    console.log(code, 'len', d.value?.length, 'first', d.value?.[0] ? {SpatialDim: d.value[0].SpatialDim, NumericValue: d.value[0].NumericValue} : null);
  }
})();
