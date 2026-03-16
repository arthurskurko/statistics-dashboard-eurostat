import { fetchTopicData } from '../src/lib/eurostat';

async function main() {
  const topicId = 'demo_pjan';
  const res = await fetchTopicData(topicId, {
    filters: {},
    geoValues: ['EE', 'FI', 'SE', 'EU27_2020'],
  });

  console.log('series count:', res.series.length);
  console.log('availableGeos:', res.availableGeos?.map((g) => g.code));
  console.log('first series:', res.series[0]?.label);
  console.log('warning:', res.warning);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
