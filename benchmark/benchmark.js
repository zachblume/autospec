import { main } from "../src/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fullCycleExamples = [
    { url: "https://todomvc.com/examples/react/dist/", shouldPass: true },
    { url: "https://demo.realworld.io/", shouldPass: true },
    { url: "https://astexplorer.net/", shouldPass: true },
    { url: "https://excalidraw.com/", shouldPass: true },
    { url: "https://vscode.dev/", shouldPass: true },

    {
        url: "https://todomvc-with-one-bug.vercel.app",
        shouldPass: false,
        humanNote: "The delete button on todos is broken",
    },
];

const specExamples = [
    {
        url: "https://todomvc.com/examples/react/dist/",
        shouldPass: true,
        specToTest: "The user should be able to add todos",
    },
    {
        url: "https://todomvc-with-one-bug.vercel.app",
        shouldPass: false,
        specToTest: "The user should be able to delete todos",
    },
];

const combinedExamples = [...fullCycleExamples, ...specExamples];

const runBenchmark = async () => {
    const results = [];
    const commitSHA = execSync("git rev-parse HEAD").toString().trim();
    const datetime = new Date().toISOString();
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    for (const example of combinedExamples) {
        console.log(`Running autospec on ${example.url}`);
        try {
            const { testResults } = await main({
                testUrl: example.url,
                modelName: "gpt-4o",
                specLimit: example.specLimit ?? 1,
                specificSpecToTest: example.specToTest,
            });

    }

    const precision = truePositives / (truePositives + falsePositives);
    const recall = truePositives / (truePositives + falseNegatives);
    const totalInputTokens = results.reduce(
        (sum, result) => sum + (result.totalInputTokens || 0),
        0,
    );
    const totalOutputTokens = results.reduce(
        (sum, result) => sum + (result.totalOutputTokens || 0),
        0,
    );

    const metrics = {
        total: results.length,
        truePositives,
        falsePositives,
        trueNegatives,
        falseNegatives,
        precision,
        recall,
        sensitivity: recall,
        specificity: trueNegatives / (trueNegatives + falsePositives),
        f1: (2 * precision * recall) / (precision + recall),
        totalInputTokens,
        totalOutputTokens,
    };

    const resultsDir = path.join(__dirname, "benchmark-results");
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "");
    const resultsPath = path.join(
        resultsDir,
        `benchmark-results-${timestamp}.json`,
    );
    const metadata = {
        commitSHA,
        datetime,
        results,
        metrics,
    };

    const jsonString = JSON.stringify(metadata, null, 4);
    fs.writeFileSync(resultsPath, jsonString);
    console.log(jsonString);
    console.log(`Benchmark results and metrics saved to ${resultsPath}`);
};

runBenchmark();
