const fs = require('fs');
// file is UTF‑16 LE (Eurostat API uses this when dumping large datasets)
let text = fs.readFileSync('abortfull.json', 'utf16le');
// strip BOM if present
if (text.charCodeAt(0) === 0xfeff) {
  text = text.slice(1);
}
const d = JSON.parse(text);
const ids = d.id;
const sizes = d.size;
const dims = d.dimension;
const timeCodes = Object.keys(dims.time.category.index);
const geoCodes = Object.keys(dims.geo.category.index);
function unravel(idx) {
  let r = idx;
  const pos = [];
  for (let i = sizes.length - 1; i >= 0; --i) {
    pos.unshift(r % sizes[i]);
    r = Math.floor(r / sizes[i]);
  }
  return pos;
}
const dataMap = {};
for (const [k, v] of Object.entries(d.value)) {
  const idx = +k;
  const pos = unravel(idx);
  const geo = geoCodes[pos[ids.indexOf('geo')]];
  const time = timeCodes[pos[ids.indexOf('time')]];
  dataMap[`${geo}:${time}`] = v;
}
const EU27 = ['BE','BG','CZ','DK','DE','EE','IE','ES','FR','HR','IT','CY','LV','LT','LU','HU','MT','NL','AT','PL','PT','RO','SI','SK','FI','SE'];
const tot = {};
for (const t of timeCodes) {
  tot[t] = 0;
  for (const g of EU27) {
    tot[t] += (dataMap[`${g}:${t}`] || 0);
  }
}
console.log(JSON.stringify(tot, null, 2));
