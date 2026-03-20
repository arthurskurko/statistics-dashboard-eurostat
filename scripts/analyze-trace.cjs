const fs = require('fs');
const path = require('path');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/analyze-trace.cjs <trace-file> [output-file]');
  process.exit(1);
}

const tracePath = path.resolve(input);
const outputPath = path.resolve(process.argv[3] || 'tmp-trace-analysis-output.json');

const raw = fs.readFileSync(tracePath, 'utf8');
const data = JSON.parse(raw);
const events = Array.isArray(data.traceEvents) ? data.traceEvents : [];
const complete = events.filter((e) => e && e.ph === 'X' && typeof e.dur === 'number');
const usToMs = (us) => us / 1000;

const byName = new Map();
for (const e of complete) {
  const name = e.name || '(unknown)';
  const bucket = byName.get(name) || { count: 0, totalUs: 0, maxUs: 0 };
  bucket.count += 1;
  bucket.totalUs += e.dur;
  if (e.dur > bucket.maxUs) bucket.maxUs = e.dur;
  byName.set(name, bucket);
}

const topByTotal = [...byName.entries()]
  .map(([name, v]) => ({
    name,
    count: v.count,
    totalMs: Number(usToMs(v.totalUs).toFixed(2)),
    avgMs: Number(usToMs(v.totalUs / v.count).toFixed(4)),
    maxMs: Number(usToMs(v.maxUs).toFixed(2)),
  }))
  .sort((a, b) => b.totalMs - a.totalMs)
  .slice(0, 40);

const longTasks50 = complete.filter((e) => e.name === 'RunTask' && e.dur >= 50000);
const longTasks16 = complete.filter((e) => e.name === 'RunTask' && e.dur >= 16000);

const frameLikeNames = [
  'FireAnimationFrame',
  'PageAnimator::serviceScriptedAnimations',
  'AnimationFrame',
  'UpdateLayoutTree',
  'Layout',
  'Paint',
  'CompositeLayers',
  'Commit',
  'RasterTask',
  'GPUTask',
  'FunctionCall',
  'v8.callFunction',
];

const frameFocus = topByTotal.filter((x) => frameLikeNames.includes(x.name));

const v8GcEvents = complete.filter((e) => {
  const n = String(e.name || '').toLowerCase();
  return n.includes('gc') || n.includes('v8.gc');
});

const musicFractalHits = complete.filter((e) => {
  const s = `${e.name || ''} ${e.cat || ''}`.toLowerCase();
  return s.includes('audio') || s.includes('music') || s.includes('oscillator') || s.includes('animationframe') || s.includes('paint') || s.includes('canvas');
});

const topLong = [...complete]
  .sort((a, b) => b.dur - a.dur)
  .slice(0, 60)
  .map((e) => ({
    name: e.name || '(unknown)',
    cat: e.cat || '',
    durMs: Number(usToMs(e.dur).toFixed(2)),
    tsMs: Number(usToMs(e.ts || 0).toFixed(2)),
  }));

const result = {
  tracePath,
  eventCount: events.length,
  completeCount: complete.length,
  runTask: {
    over16msCount: longTasks16.length,
    over50msCount: longTasks50.length,
    over16msMax: longTasks16.length ? Number(usToMs(Math.max(...longTasks16.map((e) => e.dur))).toFixed(2)) : 0,
    over50msMax: longTasks50.length ? Number(usToMs(Math.max(...longTasks50.map((e) => e.dur))).toFixed(2)) : 0,
  },
  gc: {
    count: v8GcEvents.length,
    totalMs: Number(usToMs(v8GcEvents.reduce((sum, e) => sum + e.dur, 0)).toFixed(2)),
    maxMs: v8GcEvents.length ? Number(usToMs(Math.max(...v8GcEvents.map((e) => e.dur))).toFixed(2)) : 0,
  },
  topByTotal,
  frameFocus,
  topLong,
  musicFractalEventCount: musicFractalHits.length,
};

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(outputPath);
