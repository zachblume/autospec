import { main } from "./index.js";
import fs from "fs";
import path from "path";

const examples = [
    { url: "https://todomvc.com/examples/react/dist/", shouldPass: true },
    // { url: 'https://example.com/test2', shouldPass: true },
    // { url: 'https://example.com/test3', shouldPass: true },
    // { url: 'https://example.com/test4', shouldPass: true },
    // { url: 'https://example.com/test5', shouldPass: false },
    // { url: 'https://example.com/test6', shouldPass: true },
    // { url: 'https://example.com/test7', shouldPass: false },
    // { url: 'https://example.com/test8', shouldPass: true },
    // { url: 'https://example.com/test9', shouldPass: true },
    // { url: 'https://example.com/test10', shouldPass: true },
];

const runBenchmark = async () => {
    const results = [];
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    for (const example of examples) {
        console.log(`Running autospec on ${example.url}`);
        try {
            const { testResults } = await main({
                testUrl: example.url,
                modelName: "gpt-4o",
                specLimit: 1,
            });
            results.push({ testUrl: example.url, status: "passed" });
            if (example.shouldPass) {
                truePositives++;
            } else {
                falsePositives++;
            }
        } catch (error) {
            results.push({
                testUrl: example.url,
                status: "failed",
                error: error.message,
            });
            if (example.shouldPass) {
                falseNegatives++;
            } else {
                trueNegatives++;
            }
        }

        // No need to track expected counts separately
    }

    const precision = truePositives / (truePositives + falsePositives);
    const recall = truePositives / (truePositives + falseNegatives);

    const metrics = {
        total: examples.length,
        truePositives,
        falsePositives,
        trueNegatives,
        falseNegatives,
        precision,
        recall,
    };

    const resultsPath = path.join(__dirname, "benchmark-results.json");
    fs.writeFileSync(
        resultsPath,
        JSON.stringify({ results, metrics }, null, 4),
    );
    console.log(`Benchmark results and metrics saved to ${resultsPath}`);
};

runBenchmark();
