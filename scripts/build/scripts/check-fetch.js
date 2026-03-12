"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const eurostat_1 = require("../src/lib/eurostat");
async function run() {
    try {
        const data = await (0, eurostat_1.fetchTopicData)('induced-abortions');
        console.log(JSON.stringify(data, null, 2));
    }
    catch (e) {
        console.error('error', e);
    }
}
run();
