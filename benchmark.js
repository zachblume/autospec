import { main } from './index.js';
import fs from 'fs';
import path from 'path';

const examples = [
    { url: 'https://example.com/test1', shouldPass: true },
    { url: 'https://example.com/test2', shouldPass: true },
    { url: 'https://example.com/test3', shouldPass: true },
    { url: 'https://example.com/test4', shouldPass: true },
    { url: 'https://example.com/test5', shouldPass: false },
    { url: 'https://example.com/test6', shouldPass: true },
    { url: 'https://example.com/test7', shouldPass: false },
    { url: 'https://example.com/test8', shouldPass: true },
    { url: 'https://example.com/test9', shouldPass: true },
    { url: 'https://example.com/test10', shouldPass: true },
];

const introduceBug = (example) => {
    // Introduce a bug by modifying the example URL or content
    if (!example.shouldPass) {
        return { ...example, url: example.url + '?bug=true' };
    }
    return example;
};

const runBenchmark = async () => {
    const results = [];
    let passedCount = 0;
    let failedCount = 0;
    let expectedPassCount = 0;
    let expectedFailCount = 0;

    for (const example of examples) {
        const testExample = introduceBug(example);
        console.log(`Running autospec on ${testExample.url}`);
        try {
            await main({ testUrl: testExample.url });
            results.push({ testUrl: testExample.url, status: 'passed' });
            if (testExample.shouldPass) {
                passedCount++;
            } else {
                failedCount++;
            }
        } catch (error) {
            results.push({ testUrl: testExample.url, status: 'failed', error: error.message });
            if (testExample.shouldPass) {
                failedCount++;
            } else {
                passedCount++;
            }
        }

        if (testExample.shouldPass) {
            expectedPassCount++;
        } else {
            expectedFailCount++;
        }
    }

    const metrics = {
        total: examples.length,
        passed: passedCount,
        failed: failedCount,
        expectedPass: expectedPassCount,
        expectedFail: expectedFailCount,
    };

    const resultsPath = path.join(__dirname, 'benchmark-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({ results, metrics }, null, 4));
    console.log(`Benchmark results and metrics saved to ${resultsPath}`);
};

runBenchmark();
