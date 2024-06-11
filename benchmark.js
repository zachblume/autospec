import { main } from "./index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const commitSHA = execSync("git rev-parse HEAD").toString().trim();
    const datetime = new Date().toISOString();
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    try {
        for (const example of examples) {
            console.log(`Running autospec on ${example.url}`);
            try {
                const { testResults } = await main({
                    testUrl: example.url,
                    modelName: "gpt-4o",
                    specLimit: 1,
                });

                const allPassed = testResults.every(
                    (result) => result.status === "passed",
                );

                if (allPassed) {
                    results.push({ testUrl: example.url, status: "passed" });
                    if (example.shouldPass) {
                        truePositives++;
                    } else {
                        falsePositives++;
                    }
                } else {
                    results.push({ testUrl: example.url, status: "failed" });
                    if (example.shouldPass) {
                        falseNegatives++;
                    } else {
                        trueNegatives++;
                    }
                }
            } catch (error) {
                console.error(`Error running autospec on ${example.url}:`, error);
                results.push({
                    testUrl: example.url,
                    status: "error",
                    error: error.message,
                });
                if (example.shouldPass) {
                    falseNegatives++;
                } else {
                    trueNegatives++;
                }
            }
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

        const resultsDir = path.join(__dirname, "benchmark-results");
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, "");
        const resultsPath = path.join(resultsDir, `benchmark-results-${timestamp}.json`);
        const metadata = {
            commitSHA,
            datetime,
            results,
            metrics,
        };

        fs.writeFileSync(resultsPath, JSON.stringify(metadata, null, 4));
        console.log(`Benchmark results and metrics saved to ${resultsPath}`);
    } catch (error) {
        console.error("Error during benchmark run:", error);
    }
};

runBenchmark();
