const { fetchTopicData } = require('../src/lib/eurostat');

async function run() {
  try {
    const data = await fetchTopicData('induced-abortions');
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('error', e);
  }
}

run();
