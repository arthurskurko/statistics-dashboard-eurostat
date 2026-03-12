import { fetchTopicData } from '../src/lib/eurostat';

(async () => {
  try {
    const data = await fetchTopicData('induced-abortions');
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('error', e);
  }
})();
