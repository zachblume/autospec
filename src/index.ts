import fs from "fs";
import playwright, { Browser } from "playwright";
import { getModel } from "./ai.js";
import { initializeBrowser } from "./browser.js";
import { visitPages, createTestPlan } from "./planner.js";
import { runTestSpec } from "./executor.js";
import { printTestResults, writePlaywrightSpecFile } from "./reporter.js";
import { modelNameSchema, type TestResult } from "./schemas.js";

export { type TestResult } from "./schemas.js";
export { magicStrings } from "./schemas.js";

export async function main({
    testUrl = process.env.URL || "http://localhost:3000",
    modelName: unvalidatedModelName = process.env.MODEL || "claude-opus-4-6",
    specLimit = process.env.SPEC_LIMIT
        ? parseInt(process.env.SPEC_LIMIT)
        : 10,
    apiKey,
    specFile,
    specificSpecToTest,
    trajectoriesPath = "./trajectories",
    browserPassThrough = undefined,
    recordVideo = true,
}: {
    testUrl?: string;
    modelName?: string;
    specLimit?: number;
    apiKey?: string;
    specFile?: string;
    specificSpecToTest?: string;
    trajectoriesPath?: string;
    browserPassThrough?: Browser;
    recordVideo?: boolean;
} = {}) {
    const runId =
        new Date().toISOString().replace(/[^0-9]/g, "") +
        "_" +
        Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, "0");

    fs.mkdirSync(`${trajectoriesPath}/${runId}`, { recursive: true });

    modelNameSchema.parse(unvalidatedModelName);
    const modelName = unvalidatedModelName as string;

    validateApiKey({ modelName, apiKey });
    const model = getModel({ modelName, apiKey });

    const browser =
        browserPassThrough || (await playwright.chromium.launch());

    const testResults: TestResult[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
        let testPlan: string[];

        if (specificSpecToTest) {
            testPlan = [specificSpecToTest];
        } else if (specFile) {
            testPlan = await loadSpecsFromFileOrStdin(specFile);
        } else {
            // Create a temporary context just for planning/crawling
            const { context: planContext, page } = await initializeBrowser({
                runId,
                testUrl,
                browser,
                recordVideo: false,
                trajectoriesPath,
            });

            const snapshots = await visitPages({
                page,
                runId,
                testUrl,
                trajectoriesPath,
            });

            await planContext.close();

            const planResult = await createTestPlan({
                snapshots,
                model,
            });
            testPlan = planResult.testPlan;
            totalInputTokens += planResult.promptTokens;
            totalOutputTokens += planResult.completionTokens;
        }

        console.log(
            `Running ${Math.min(testPlan.length, specLimit)} specs...\n`,
        );

        // Each spec gets its own context via runTestSpec → initializeBrowser
        const specPromises = testPlan.slice(0, specLimit).map((spec) =>
            runTestSpec({
                runId,
                spec,
                browser,
                model,
                testUrl,
                trajectoriesPath,
                recordVideo,
            }),
        );

        const results = await Promise.all(specPromises);
        testResults.push(...results);

        for (const r of results) {
            totalInputTokens += r.totalInputTokens;
            totalOutputTokens += r.totalOutputTokens;
        }

        return { testResults, totalInputTokens, totalOutputTokens };
    } catch (e) {
        console.error("Error running specs:", e);
        return { testResults, totalInputTokens, totalOutputTokens };
    } finally {
        if (!browserPassThrough) {
            await browser.close();
        }
        printTestResults({ testResults });
        writePlaywrightSpecFile({
            runId,
            testUrl,
            testResults,
            trajectoriesPath,
        });
    }
}

function validateApiKey({
    modelName,
    apiKey,
}: {
    modelName: string;
    apiKey?: string;
}) {
    if (apiKey) return;

    const envKeys: Record<string, string> = {
        "gpt-5.4": "OPENAI_API_KEY",
        "claude-opus-4-6": "ANTHROPIC_API_KEY",
        "gemini-2.5-flash": "GOOGLE_GENERATIVE_AI_API_KEY",
    };

    const envKey = envKeys[modelName];
    if (envKey && !process.env[envKey]) {
        throw new Error(
            `No API key provided for ${modelName}. ` +
                `Pass --apikey or set the ${envKey} environment variable.`,
        );
    }
}

async function loadSpecsFromFileOrStdin(specFile: string): Promise<string[]> {
    let specs: string;
    if (specFile === "-") {
        specs = await new Promise((resolve, reject) => {
            let data = "";
            process.stdin.on("data", (chunk: Buffer) =>
                (data += chunk.toString()),
            );
            process.stdin.on("end", () => resolve(data));
            process.stdin.on("error", reject);
        });
    } else {
        specs = fs.readFileSync(specFile, "utf8");
    }

    const parsed = JSON.parse(specs);
    if (
        !Array.isArray(parsed) ||
        !parsed.every((s: unknown) => typeof s === "string")
    ) {
        throw new Error("Specs file must contain a JSON array of strings");
    }
    return parsed;
}
