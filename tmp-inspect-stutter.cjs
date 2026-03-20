const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tmp-inspect-stutter.cjs <trace>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const events = (data.traceEvents || []).filter((e) => e && e.ph === 'X' && typeof e.dur === 'number');

let t0 = Infinity;
for (const e of events) {
  if (typeof e.ts === 'number' && e.ts < t0) t0 = e.ts;
}

const steady = events.filter((e) => typeof e.ts === 'number' && e.ts >= t0 + 800000);

const longFunctionCalls = steady.filter((e) => e.name === 'FunctionCall' && e.dur >= 3000);
const byUrl = new Map();
for (const e of longFunctionCalls) {
  const url = e.args && e.args.data && e.args.data.url ? String(e.args.data.url) : '(no-url)';
  const b = byUrl.get(url) || { count: 0, totalMs: 0, maxMs: 0 };
  const ms = e.dur / 1000;
  b.count += 1;
  b.totalMs += ms;
  if (ms > b.maxMs) b.maxMs = ms;
  byUrl.set(url, b);
}

const eventDispatch = steady.filter((e) => e.name === 'EventDispatch');
const byEventType = new Map();
for (const e of eventDispatch) {
  const type = e.args && e.args.data && e.args.data.type ? String(e.args.data.type) : '(unknown)';
  const b = byEventType.get(type) || { count: 0, totalMs: 0, maxMs: 0 };
  const ms = e.dur / 1000;
  b.count += 1;
  b.totalMs += ms;
  if (ms > b.maxMs) b.maxMs = ms;
  byEventType.set(type, b);
}

const runTaskLong = steady.filter((e) => e.name === 'RunTask' && e.dur >= 16000);
let runTaskMax = 0;
for (const e of runTaskLong) runTaskMax = Math.max(runTaskMax, e.dur);

const output = {
  steadyCompleteCount: steady.length,
  runTaskOver16: runTaskLong.length,
  runTaskMaxMs: Number((runTaskMax / 1000).toFixed(2)),
  longFunctionCallCount: longFunctionCalls.length,
  topFunctionUrls: [...byUrl.entries()]
    .map(([url, v]) => ({
      url,
      count: v.count,
      totalMs: Number(v.totalMs.toFixed(2)),
      avgMs: Number((v.totalMs / v.count).toFixed(2)),
      maxMs: Number(v.maxMs.toFixed(2)),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 12),
  topEventDispatchTypes: [...byEventType.entries()]
    .map(([type, v]) => ({
      type,
      count: v.count,
      totalMs: Number(v.totalMs.toFixed(2)),
      avgMs: Number((v.totalMs / v.count).toFixed(2)),
      maxMs: Number(v.maxMs.toFixed(2)),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 12),
};

console.log(JSON.stringify(output, null, 2));
