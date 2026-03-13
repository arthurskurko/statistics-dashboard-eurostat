import { fetchTopicData } from './src/lib/eurostat';

async function run() {
  console.log('fetching topic...');
  const data = await fetchTopicData('induced-abortions');
  console.log('returned periods', data.periods.slice(-5));
  const eu = data.series.find((s) => s.label.includes('European Union'));
  console.log('EU series points', eu?.points.slice(-5));
}

run().catch((e) => { console.error('error', e); });
