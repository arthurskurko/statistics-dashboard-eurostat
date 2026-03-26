const fetch = (...args) => import('node-fetch').then(m=>m.default(...args));
(async()=>{
  const url = 'https://ghoapi.azureedge.net/api/SDGTOBACCO?$format=json&$top=20';
  const res = await fetch(url);
  const data = await res.json();
  console.log('total', data.value?.length);
  console.log(JSON.stringify(data.value?.slice(0,3), null, 2));
})();
