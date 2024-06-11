import { main } from './index.js';
import fs from 'fs';
import path from 'path';

const examples = [
    'https://example.com/test1',
    'https://example.com/test2',
    'https://example.com/test3',
    'https://example.com/test4',
    'https://example.com/test5',
    'https://example.com/test6',
    'https://example.com/test7',
    'https://example.com/test8',
    'https://example.com/test9',
    'https://example.com/test10',
];

const introduceBug = (example) => {
    // Introduce a bug by modifying the example URL or content
    if (example.includes('test5') || example.includes('test7')) {
        return example + '?bug=true';
    }
    return example;
};

const runBenchmark = async () => {
    const results = [];
    for (const example of examples) {
        const testUrl = introduceBug(example);
        console.log(`Running autospec on ${testUrl}`);
        try {
            await main({ testUrl });
            results.push({ testUrl, status: 'passed' });
        } catch (error) {
            results.push({ testUrl, status: 'failed', error: error.message });
        }
    }

    const resultsPath = path.join(__dirname, 'benchmark-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 4));
    console.log(`Benchmark results saved to ${resultsPath}`);
};

runBenchmark();
