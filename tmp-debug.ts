import { fetchTopicData } from './src/lib/eurostat.js';

(async () => {
  try {
    const data = await fetchTopicData('induced-abortions', { forecastHorizon: 20 });
    console.log('periods last', data.periods.slice(-6));
    const eu = data.series.find((s) => s.label.includes('European Union'));
    console.log('eu last', eu?.points.slice(-6));
    const est = data.series.find((s) => s.label === 'Estonia');
    console.log('est last', est?.points.slice(-6));
  } catch (err) {
    console.error('ERROR', err);
  }
})();
