import fetch from 'node-fetch';

const EUROSTAT_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

function inferSortKey(periodCode) {
  const annual = /^(\d{4})$/;
  const monthly = /^(\d{4})M(\d{2})$/;
  const quarterly = /^(\d{4})-?Q(\d)$/i;
  const halfYear = /^(\d{4})-?[HS](\d)$/i;
  if (annual.test(periodCode)) return Number(periodCode) * 100;
  let m = periodCode.match(monthly);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = periodCode.match(quarterly);
  if (m) return Number(m[1]) * 100 + Number(m[2]) * 3;
  m = periodCode.match(halfYear);
  if (m) return Number(m[1]) * 100 + Number(m[2]) * 6;
  return Number(periodCode.replace(/\D/g, '')) || 0;
}
function formatPeriodLabel(code) {
  const m = code.match(/^(\d{4})M(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  const n = code.match(/^(\d{4})S(\d)$/i);
  if (n) return `${n[1]} H${n[2]}`;
  return code;
}
function getDimensionInfo(dataset) {
  const dims = dataset.dimension;
  return dataset.id.map((id) => {
    const cat = dims[id].category;
    const idx = cat.index;
    let codes;
    if (Array.isArray(idx)) {
      codes = idx.slice();
    } else {
      codes = Object.entries(idx)
        .sort((a,b)=>a[1]-b[1])
        .map(([code])=>code);
    }
    return {id, codes, labels: cat.label||{}};
  });
}
function parseSeries(dataset) {
  const dims = getDimensionInfo(dataset);
  const timeDim = dims.find(d=>/time/i.test(d.id))||dims[dims.length-1];
  const geoDim = dims.find(d=>d.id.toLowerCase()==='geo');
  const timeIdx = dims.indexOf(timeDim);
  const geoIdx = geoDim?dims.indexOf(geoDim):-1;
  let periods = timeDim.codes.slice()
    .map(c=>({c,sort:inferSortKey(c)}))
    .sort((a,b)=>a.sort-b.sort)
    .map(o=>formatPeriodLabel(o.c));
  const values = Array.isArray(dataset.value)
    ? dataset.value.map((v,i)=>[i,v])
    : Object.entries(dataset.value).map(([i,v])=>[Number(i),v]);
  const seriesMap = new Map();
  for(const [flat, raw] of values) {
    if (raw==null||Number.isNaN(Number(raw))) continue;
    const pos=[];
    let r=flat;
    for(let s of [...dataset.size].reverse()){pos.unshift(r % s); r=Math.floor(r/s);}
    const label = formatPeriodLabel(timeDim.codes[pos[timeIdx]]);
    const geo = geoDim ? geoDim.codes[pos[geoIdx]] : 'all';
    const geoLabel = geoDim? (geoDim.labels[geo]||geo) : 'all';
    const pt={periodCode:timeDim.codes[pos[timeIdx]],label,sortKey:inferSortKey(timeDim.codes[pos[timeIdx]]),value:Number(raw)};
    const arr=seriesMap.get(geoLabel)||[];
    arr.push(pt);
    seriesMap.set(geoLabel,arr);
  }
  const series=[];
  for(const [label,pts] of seriesMap) {
    pts.sort((a,b)=>a.sortKey-b.sortKey);
    series.push({label,points:pts});
  }
  return {series, periods};
}

async function main(){
  const code='DEMO_FABORTORD';
  // mimic buildUrl using topic filters and geo values
  const url = `${EUROSTAT_BASE}/${code}?lang=en&freq=A&unit=NR&age=TOTAL&ord_brth=TOTAL` +
    '&geo=EE&geo=EU27_2020';
  console.log('fetch url',url);
  const resp=await fetch(url);
  const data=await resp.json();
  const {series,periods}=parseSeries(data);
  console.log('parsed periods',periods);
  console.log('series count',series.length);
  console.log('series labels',series.map(s=>s.label));
  let eu = series.find(s=>s.label.includes('European Union'));
  console.log('has EU?',!!eu);
  if(eu) console.log('EU last points',eu.points.slice(-3));
  // now simulate synthetic aggregate (if not present, we'll build one)
  const EU27_CODES=[
    'BE','BG','CZ','DK','DE','EE','IE','ES','FR','HR','IT','CY','LV','LT','LU',
    'HU','MT','NL','AT','PL','PT','RO','SI','SK','FI','SE',
  ];
  // buildAggregate
  function buildAggregate(dataset, includeCodes,label){
    const dims=getDimensionInfo(dataset);
    const timeDim=dims.find(d=>/time/i.test(d.id))||dims[dims.length-1];
    const geoDim=dims.find(d=>d.id.toLowerCase()==='geo');
    const timeIdx=dims.indexOf(timeDim);
    const geoIdx=geoDim?dims.indexOf(geoDim):-1;
    const periodsList=timeDim.codes.slice();
    const pts=periodsList.map(code=>({periodCode:code,label:formatPeriodLabel(code),sortKey:inferSortKey(code),value:0}));
    const vals=Array.isArray(dataset.value)?dataset.value.map((v,i)=>[i,v]):Object.entries(dataset.value).map(([i,v])=>[Number(i),v]);
    for(const [flat,raw] of vals){
      if(raw==null||Number.isNaN(Number(raw))) continue;
      const pos=[]; let r=flat;
      for(let s of [...dataset.size].reverse()){pos.unshift(r % s); r=Math.floor(r/s);} 
      const geoCode=geoDim.codes[pos[geoIdx]];
      if(!includeCodes.includes(geoCode)) continue;
      const timeCode=timeDim.codes[pos[timeIdx]];
      const pt=pts.find(p=>p.periodCode===timeCode);
      if(pt) pt.value+=Number(raw);
    }
    return {id:label,label,points:pts.filter(p=>p.value!==0)};
  }
  // check synthetic
  const fullResp=await fetch(`${EUROSTAT_BASE}/${code}?lang=en&freq=A&unit=NR&age=TOTAL&ord_brth=TOTAL`);
  const fullData=await fullResp.json();
  const euAgg=buildAggregate(fullData,EU27_CODES,'European Union - 27 countries (from 2020)');
  console.log('euAgg last pts',euAgg.points.slice(-3));
  if(!eu){
    eu = euAgg; // use synthetic aggregate if original missing
    console.log('using synthetic euAgg');
  }
  // append forecast
  const fs = await import('fs');
  const fcData = JSON.parse(fs.readFileSync('public/forecasts/DEMO_FABORTORD.json', 'utf8'));
  const lastYear=Number(periods[periods.length-1]);
  const nextYear=String(lastYear+1);
  periods.push(nextYear);
  eu.points.push({periodCode:nextYear,label:nextYear,sortKey:inferSortKey(nextYear),value:fcData.forecast[0],predicted:true});
  console.log('after append EU points',eu.points.slice(-3));
}

main().catch(console.error);
