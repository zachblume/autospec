import { createAnthropic } from "@ai-sdk/anthropic";
import sharp from "sharp";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { CoreMessage, generateObject } from "ai";
import { z } from "zod";
import chalk from "chalk";
import dotenv from "dotenv";
import fs from "fs";
import playwright, { Browser, BrowserContext, Frame } from "playwright";
import stripAnsi from "strip-ansi";
import winston from "winston";

import * as schemas from "./schemas";

declare global {
    interface Window {
        getMousePosition: () => { x: number; y: number }; // Adjust the type of 'pw' if it's more specific
    }
}

dotenv.config();

export const initialSystemPrompt = `
You are an automated QA agent tasked with testing a web application just as
software engineer assigned to manual testing would. Here are your
instructions:

1. At first, you'll be given a screenshot or series of screenshots mapping
   out the current behavior of the application. Describe the application and
   then provide a JSON array of formal checks that you will carry out.

    - It's important to formulate the checks in a way that is not overly
      dependent on the current state or behavior of the application, but
      rather on the intended functionality of such application. You are
      going to run these checks immediately after you describe the
      application, so if you describe it too literally or reliant on the
      current state like strings, you may be overfitting.
    - You respond with a JSON object containing a single key,
      'arrayOfSpecs', which is a JSON array of your test plan and nothing
      else, without prefixes or suffixes.
    - The array should be an array of strings, with no further object
      complexity (we will call these 'specs').
    - Covering the most amount of user journeys with the fewest amount of
      steps is the goal.

2. After the mapping and description phase, you'll be provided a spec that
   you wrote to focus on specifically, one at a time. You'll begin a loop
   executing actions in order to fulfill the spec. On each turn, you'll be
   provided a screenshot, a HTML dump, and the current
   mouse cursor position and other metadata.
    
    - Your goal is to interact only with the elements necessary to fulfill
      the current spec.
    - The red dot in the screenshot is your current mouse cursor position.
      The X and Y coordinates of the mouse cursor are in the 1024x1024
      coordinate system.
    - Focus on inputs is not always clearly visible. You always check that
      the mouse cursor is correctly positioned over the target element
      before you proceed with any clicking or typing actions. If the cursor
      is not correctly positioned, you must adjust it first.
    - Ignore any irrelevant text or elements on the page that do not pertain
      to the current spec and step you're trying to reason about.
    - Never forget that it may be necessary to hover over elements with your
      mouse or go to different pages to test the full functionality of the
      resources or their mutations that you are looking for. If you don't
      immediately see what you are looking for, before declaring a spec
      failure, try to see if you can find it by interacting with the page or
      application a little more.
    - You always adjust your mouse position to the correct location before
      clicking or proceeding with interactions if it seems like your mouse
      position is off.
    - You are always provided with a screenshot AND a copy of the current
      rendered HTML of the page. You can use the HTML to cross-reference
      with the screenshot to make sure you are interacting with the correct
      elements.
    - You always make up appropriate selectors based on the HTML
      snapshot, by relating the HTML snapshot to the screenshot you are
      provided, and then coming up with a valid css selector that you can
      use to interact with the element in question. You always use the nth
      property to disambiguate between multiple elements that match the same
      selector. Nth is 0-indexed.
    - When creating CSS selectors, ensure they are unique and specific
      enough to select only one element, even if there are multiple elements
      of the same type (like multiple h1 elements).
    - Avoid using generic tags like 'h1' alone. Instead, combine them with
      other attributes or structural relationships to form a unique
      selector.

3. You have an API of actions you can take: type Action = { action: String;
    selector?: String; nth?: Number; string?: String; key?: String;
    deltaX?: Number; deltaY?: Number; milliseconds?: Number; reason?:
    String; explanationWhySpecComplete?: String;
    }

    The possible actions are:
    [
        { action:"hoverOver"; selector: String; nth: Number },
        { action:"clickOn", selector: String; nth: Number },
        { action:"doubleClickOn"; selector: String; nth: Number },
        { action:"keyboardInputString"; selector: String; nth: Number; string:String },
        { action:"keyboardInputSingleKey"; selector: String; nth: Number; key:String },
        { action:"scroll"; deltaX:Number; deltaY:Number },
        { action:"hardWait"; milliseconds: Number },
        { action:"gotoURL"; url: String },
        {
            action:"markSpecAsComplete";
            reason:
                "${schemas.magicStrings.specPassed}" | "${schemas.magicStrings.specFailed}";
            explanationWhySpecComplete: String
        },
    ];

    - If the screenshot already provided you enough information to answer
      this spec completely and say that the spec has passed, you will mark
      the spec as complete with appropriate API call and reason.
    - If the screenshot already provided you enough information to answer
      this spec completely and say that the spec has failed in your
      judgement, you will mark the spec as complete with appropriate API
      call and reason.
    - You only make one API request on this turn.
    - You only name an action type that was enumerated above.
    - You only provide the parameters that are required for that action type
      enumerated above.

    A PlanActionStep is a JSON object that follows the following schema:

    type PlanActionStep =
    {
        planningThoughtAboutTheActionIWillTake: String;
        action: Action;
    }
    
    - You only respond with only the JSON of the next PlanActionStep you
      will take and nothing else. You respond with the JSON object only,
      without prefixes or suffixes. You never prefix it with backticks or \`
      or anything like that.
`;

export const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}] - ${message}`;
        }),
    ),
    transports: [new winston.transports.Console()],
});

type TestResult = {
    spec: string;
    status: "passed" | "failed";
    actions: z.infer<typeof schemas.actionStepSchema>[];
    totalInputTokens: number;
    totalOutputTokens: number;
    reason?: string;
};

export const testResults: TestResult[] = [];

export const modelNameSchema = z.enum([
    "gpt-4o",
    "gemini-1.5-flash-latest",
    "claude-3-haiku",
]);
export type ModelName = z.infer<typeof modelNameSchema>;

export async function main({
    testUrl = process.env.URL || "http://localhost:3000",
    modelName: unvalidatedModelName = process.env.MODEL || "gpt-4o",
    specLimit = process.env.SPEC_LIMIT && parseInt(process.env.SPEC_LIMIT)
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

    logger.add(
        new winston.transports.File({
            filename: `${trajectoriesPath}/${runId}/combined.log`,
            format: winston.format.combine(
                winston.format.printf(
                    ({ timestamp, level, message }) =>
                        `${timestamp} [${level.toUpperCase()}] - ${stripAnsi(message)}`,
                ),
            ),
        }),
    );

    // Validate the model name
    modelNameSchema.parse(unvalidatedModelName);
    const modelName = unvalidatedModelName as ModelName;

    // Roughly validate that an appropriate API key is provided by flag or env
    if (!apiKey) {
        const errorMsg = ({
            modelName,
            keyName,
        }: {
            modelName: string;
            keyName: string;
        }) => {
            throw new Error(
                `You specified ${modelName} as model but did not provide an ` +
                    `${keyName} API key.\nPlease provide an API key via the ` +
                    `--apikey flag (e.g. npx autospecai --model gpt-4o ` +
                    `--apikey YOUR_KEY_HERE) or the ${keyName} environment ` +
                    `variable.`,
            );
        };
        if (modelName === "gpt-4o" && !process.env.OPENAI_API_KEY) {
            errorMsg({ modelName: "GPT-4o", keyName: "OPENAI_API_KEY" });
        }
        if (
            modelName === "gemini-1.5-flash-latest" &&
            !process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ) {
            errorMsg({
                modelName: "Gemini Flash",
                keyName: "GOOGLE_GENERATIVE_AI_API_KEY",
            });
        }
        if (modelName === "claude-3-haiku" && !process.env.ANTHROPIC_API_KEY) {
            errorMsg({
                modelName: "Claude Haiku",
                keyName: "ANTHROPIC_API_KEY",
            });
        }
    }

    const modelConfigs = {
        "gemini-1.5-flash-latest": createGoogleGenerativeAI({
            apiKey: apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        })("models/gemini-1.5-flash-latest"),
        "gpt-4o": createOpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        })("gpt-4o"),
        "claude-3-haiku": createAnthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        })("claude-3-haiku-20240307"),
    };
    const model = modelConfigs[modelName];

    const { browser, context, page } = await initializeBrowser({
        runId,
        testUrl,
        ...(browserPassThrough ? { browser: browserPassThrough } : {}),
        recordVideo,
        trajectoriesPath,
    });

    try {
        let testPlan: string[];
        if (specificSpecToTest) {
            testPlan = [specificSpecToTest];
        } else if (specFile) {
            testPlan = await loadSpecsFromFileOrStdin(specFile);
        } else {
            await visitPages({
                page,
                runId,
                testUrl,
                trajectoriesPath,
            });
            const { videoFrames } = await getVideoFrames({
                runId,
                trajectoriesPath,
            });
            const { testPlan: generatedTestPlan } = await createTestPlan({
                videoFrames,
                model,
            });
            testPlan = generatedTestPlan;
        }

        // Cleanup the context, but leave the browser alive as a global
        // await context.close();

        const testPromises = testPlan.slice(0, specLimit).map((spec, i) =>
            runTestSpec({
                runId,
                spec,
                browser,
                context,
                specId: i,
                model,
                testUrl,
                trajectoriesPath,
                recordVideo,
            }),
        );

        await Promise.all(testPromises);

        logger.info("Test complete");
        const totalInputTokens = testResults.reduce(
            (sum, result) => sum + (result.totalInputTokens || 0),
            0,
        );
        const totalOutputTokens = testResults.reduce(
            (sum, result) => sum + (result.totalOutputTokens || 0),
            0,
        );
        return { testResults, totalInputTokens, totalOutputTokens };
    } catch (e) {
        logger.error("Test error", e);
        console.error(e);
        return { testResults };
    } finally {
        await context.close();
        await browser.close();
        await printTestResults({
            runId,
            testResults,
            testUrl,
            trajectoriesPath,
        });
    }
}

type NewCompletionProps = {
    messages: CoreMessage[];
    schema: z.ZodSchema<any>;
    model: ReturnType<
        ReturnType<
            | typeof createGoogleGenerativeAI
            | typeof createOpenAI
            | typeof createAnthropic
        >
    >;
};
export async function newCompletion({
    messages,
    schema,
    model,
}: NewCompletionProps): Promise<{
    object: z.infer<typeof schema>;
    completionTokens: number;
    promptTokens: number;
}> {
    const { object, usage } = await generateObject<typeof schema>({
        model,
        messages,
        temperature: 0.0,
        maxRetries: 5,
        maxTokens: 1000,
        seed: 0,
        schema,
    });

    logger.info(JSON.stringify(object, null, 4));

    const { completionTokens, promptTokens } = usage;
    return { object, completionTokens, promptTokens };
}

type preventBrowserFromNavigatingToOtherHostsProps = {
    page: playwright.Page;
    testUrl: string;
};
async function preventBrowserFromNavigatingToOtherHosts({
    page,
    testUrl,
}: preventBrowserFromNavigatingToOtherHostsProps) {
    const hostOfTestUrl = new URL(testUrl).host;
    page.on("framenavigated", async (frame: Frame) => {
        const currentUrl = frame.url();
        const urlObject = new URL(currentUrl);
        if (urlObject.host !== hostOfTestUrl) {
            await frame.evaluate(() => {
                window.stop();
            });
            throw new Error(
                `Navigation to ${currentUrl} was stopped because that URL is
                not on the same host as the test URL, ${testUrl}. Use the
                gotoURL action to navigate back to the previous URL and
                recover from this failure state.`,
            );
        }
    });
}

export async function initializeBrowser({
    runId,
    browser: browserPassedThrough,
    context: contextPassedThrough,
    testUrl,
    trajectoriesPath,
    recordVideo = true,
}: {
    runId: string;
    testUrl: string;
    trajectoriesPath: string;
    recordVideo: boolean;
    browser?: Browser;
    context?: BrowserContext;
}) {
    const browser =
        browserPassedThrough || (await playwright.chromium.launch());
    const context =
        contextPassedThrough ||
        (await browser.newContext({
            viewport: {
                height: 1024,
                width: 1024,
            },
            screen: {
                height: 1024,
                width: 1024,
            },
            ...(recordVideo === true
                ? {
                      recordVideo: {
                          dir: `${trajectoriesPath}/${runId}`,
                          size: { width: 1024, height: 1024 },
                      },
                  }
                : {}),
            logger: {
                // isEnabled: (name, severity) => true,
                isEnabled: () => true,
                log: (name, severity, message) =>
                    logger.info(
                        `Playwright - ${message} [${name}] [${severity}]`,
                    ),
            },
        }));
    context.setDefaultTimeout(2500);
    const page = await context.newPage();

    await page.addInitScript(() => {
        let x = 0,
            y = 0;
        document.onmousemove = (e) => {
            x = e.pageX;
            y = e.pageY;
        };
        window.getMousePosition = () => ({ x, y });
    });

    await preventBrowserFromNavigatingToOtherHosts({ page, testUrl });

    return { browser, context, page };
}

type visitPagesProps = {
    page: playwright.Page;
    runId: string;
    testUrl: string;
    trajectoriesPath: string;
};
export async function visitPages({
    page,
    runId,
    testUrl,
    trajectoriesPath,
}: visitPagesProps) {
    await page.goto(testUrl);
    await page.waitForTimeout(100);

    const urlsAlreadyVisited = new Set();
    const urlsToVisit = new Set([testUrl]);
    let i = 0;
    const max = 1;

    while (urlsToVisit.size > 0 && i < max) {
        const url = urlsToVisit.values().next().value;
        urlsToVisit.delete(url);
        urlsAlreadyVisited.add(url);
        await page.goto(url);
        await saveScreenshotWithCursor({
            page,
            path: `${trajectoriesPath}/${runId}/screenshot-${i}.png`,
        });
        const links = await page.$$eval("a", (as: HTMLAnchorElement[]) =>
            as.map((a: HTMLAnchorElement) => a.href),
        );
        for (const link of links) {
            if (link.startsWith(testUrl) && !urlsAlreadyVisited.has(link)) {
                urlsToVisit.add(link);
            }
            i++;
            if (i >= max) {
                break;
            }
        }
    }
}

type getVideoFramesProps = {
    runId: string;
    trajectoriesPath: string;
};
export async function getVideoFrames({
    runId,
    trajectoriesPath,
}: getVideoFramesProps): Promise<{
    videoFrames: { type: "image"; image: Buffer }[];
}> {
    return new Promise((resolve, reject) => {
        fs.readdir(`${trajectoriesPath}/${runId}`, (err, files) => {
            if (err) {
                reject(err);
                return;
            }
            const frames = files
                .sort()
                .filter((file) => file.endsWith(".png"))
                .map((file) => {
                    const path = `${trajectoriesPath}/${runId}/${file}`;
                    const screenshot = fs.readFileSync(path);
                    return {
                        type: "image" as const,
                        image: screenshot,
                    };
                });

            resolve({ videoFrames: frames });
        });
    });
}

export async function createTestPlan({
    videoFrames,
    model,
}: {
    videoFrames: { type: "image"; image: Buffer }[];
    model: ReturnType<
        | ReturnType<typeof createGoogleGenerativeAI>
        | ReturnType<typeof createOpenAI>
        | ReturnType<typeof createAnthropic>
    >;
}) {
    const conversationHistory: CoreMessage[] = [
        {
            role: "system",
            content: initialSystemPrompt,
        },
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "Describe the screenshot and create a test plan.",
                },
                ...videoFrames,
            ],
        },
    ];

    const {
        object: testPlan,
        completionTokens,
        promptTokens,
    } = await newCompletion({
        messages: conversationHistory,
        schema: schemas.testPlanSchema,
        model,
    });

    const testPlanJson = testPlan?.arrayOfSpecs;

    if (!Array.isArray(testPlanJson)) {
        throw new Error("Test plan is not an array");
    }
    testPlanJson.forEach((spec) => {
        if (typeof spec !== "string") {
            throw new Error("Test plan spec is not a string");
        }
    });

    return { testPlan: testPlanJson, completionTokens, promptTokens };
}

export function stringifyError(error: any) {
    if (error instanceof Error) {
        return error.message + "\n" + error.stack;
    }
    if (typeof error === "string") {
        return error;
    }
    return JSON.stringify(error, null, 4);
}

export async function runTestSpec({
    runId,
    spec,
    browser,
    context,
    maxIterations = 10,
    specId,
    model,
    testUrl,
    trajectoriesPath,
    recordVideo = true,
}: {
    runId: string;
    spec: string;
    browser: Browser;
    context: BrowserContext;
    maxIterations?: number;
    specId: number;
    model: ReturnType<
        | ReturnType<typeof createGoogleGenerativeAI>
        | ReturnType<typeof createOpenAI>
        | ReturnType<typeof createAnthropic>
    >;
    testUrl: string;
    trajectoriesPath: string;
    recordVideo?: boolean;
}) {
    const { page } = await initializeBrowser({
        runId,
        browser,
        context,
        testUrl,
        trajectoriesPath,
        recordVideo,
    });

    let specFulfilled = false;
    let k = 0;
    const conversationHistory: CoreMessage[] = [
        {
            role: "system",
            content: initialSystemPrompt,
        },
    ];
    const actionsTaken: z.infer<typeof schemas.actionStepSchema>[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
        await page.goto(testUrl);
        while (!specFulfilled && ++k < maxIterations) {
            await saveScreenshotWithCursor({
                page,
                path: `${trajectoriesPath}/${runId}/screenshot-${specId}-${k}.png`,
            });

            const screenshot = fs.readFileSync(
                `${trajectoriesPath}/${runId}/screenshot-${specId}-${k}.png`,
            );

            const { x: currentX, y: currentY } = await page.evaluate(() =>
                window.getMousePosition(),
            );
            logger.info(`Current mouse position: (${currentX}, ${currentY})`);

            conversationHistory.push({
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `
                            We're continuing to focus on this spec you previously
                            provided: "${spec}"
                        `,
                    },
                    {
                        type: "image",
                        image: screenshot,
                    },
                    {
                        type: "text",
                        text: `
                            \`\`\`
                            Here is an HTML snapshot of the page:
                            ${fs.readFileSync(
                                `${trajectoriesPath}/${runId}/screenshot-${specId}-${k}.html`,
                            )}
                            \`\`\`
                        `,
                    },
                    {
                        type: "text",
                        text: `
                            The current X and Y coordinates of the mouse cursor
                            are (${currentX}, ${currentY}) in the 1024x1024
                            coordinate system.
                        `,
                    },
                    {
                        type: "text",
                        text: `
                            The current URL is: ${page.url()}
                        `,
                    },
                ],
            });

            const {
                object: action,
                completionTokens,
                promptTokens,
            } = await newCompletion({
                messages: conversationHistory,
                schema: schemas.actionStepSchema,
                model,
            });

            totalInputTokens += promptTokens;
            totalOutputTokens += completionTokens;

            conversationHistory.push({
                role: "assistant",
                content: JSON.stringify(action),
            });

            actionsTaken.push(action);
            const result = await executeAction({ page, action });
            if (result?.error) {
                conversationHistory.push({
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `
                                The following error occurred while executing the action:
                                \`\`\`
                                ${stringifyError(result.error)}
                                \`\`\`
                            `,
                        },
                    ],
                });
            }

            if (
                JSON.stringify(action).includes(schemas.magicStrings.specPassed)
            ) {
                specFulfilled = true;
                testResults.push({
                    spec,
                    status: "passed",
                    actions: actionsTaken,
                    totalInputTokens,
                    totalOutputTokens,
                });
            } else if (
                JSON.stringify(action).includes(schemas.magicStrings.specFailed)
            ) {
                logger.info("Spec failed");
                logger.info("Reasoning:");
                logger.info(action?.action?.explanationWhySpecComplete);
                testResults.push({
                    spec,
                    status: "failed",
                    reason: action?.action?.explanationWhySpecComplete,
                    actions: actionsTaken,
                    totalInputTokens,
                    totalOutputTokens,
                });
                specFulfilled = true;
            }
        }

        if (!specFulfilled) {
            logger.info(`Spec failed due to max iterations (${maxIterations})`);
            testResults.push({
                spec,
                status: "failed",
                reason: `Max iterations (${maxIterations}) reached`,
                actions: actionsTaken,
                totalInputTokens,
                totalOutputTokens,
            });
        }
    } finally {
        await context.close();
    }
}

export async function executeAction({
    page,
    action: { action, planningThoughtAboutTheActionIWillTake },
}: {
    page: playwright.Page;
    action: z.infer<typeof schemas.actionStepSchema>;
}) {
    if (!action?.action) {
        console.error("No action provided", action);
        console.error(
            "planningThoughtAboutTheActionIWillTake",
            planningThoughtAboutTheActionIWillTake,
        );
        return;
    }

    try {
        switch (action.action) {
            case "hover":
                await page.locator(action.selector).hover();
                break;
            case "click":
                if ((action.clickCount = 2)) {
                    await page.locator(action.selector).dblclick();
                } else {
                    await page.locator(action.selector).click();
                }
                break;
            case "fill":
                await page.locator(action.selector).fill(action.text);
                break;
            case "press":
                await page.locator(action.selector).press(action.key);
                break;
            case "scroll":
                await page.mouse.wheel(action.deltaX, action.deltaY);
                break;
            case "hardWait":
                await page.waitForTimeout(action.milliseconds);
                break;
            case "navigate":
                await page.goto(action.url);
                break;
            case "markAsComplete":
                logger.info(`Spec marked as complete: ${action.reason}`);
                break;
            default:
                throw new Error(`Unknown action: ${JSON.stringify(action)}`);
        }
        await page.waitForTimeout(50);
        return { success: true, error: null };
    } catch (error) {
        logger.error("Error executing action:", error);
        return { error, success: false };
    }
}

export async function saveScreenshotWithCursor({
    page,
    path,
}: {
    page: playwright.Page;
    path: string;
}) {
    // Capture the HTML snapshot
    const html = await page.content();
    fs.writeFileSync(path.replace(".png", ".html"), html);

    // Capture screenshot with cursor
    const { x, y } = await page.evaluate(() => window.getMousePosition());

    const screenshotBuffer = await page.screenshot();

    // Create an image with cursor
    const img = sharp(screenshotBuffer);
    const { width, height } = await img.metadata();

    const cursor = Buffer.from(`
        <svg height="${height}" width="${width}">
            <circle cx="${x}" cy="${y}" r="4" fill="red" />
        </svg>
    `);

    await img.composite([{ input: cursor, blend: "over" }]).toFile(path);
}

export async function printTestResults({
    runId,
    testResults,
    testUrl,
    trajectoriesPath,
}: {
    runId: string;
    testResults: TestResult[];
    testUrl: string;
    trajectoriesPath: string;
}) {
    logger.info("\n\n");
    logger.info(chalk.bold("Test Summary:"));

    testResults.forEach((result, index) => {
        const status =
            result.status === "passed" ? chalk.green("✔") : chalk.red("✘");
        logger.info(`${status} ${index + 1}. ${result.spec}`);
        result.actions.forEach((action, innerIndex) => {
            logger.info(
                `  ${index + 1}.${innerIndex + 1}) ${Object.entries({
                    ...action.action,
                    ...{
                        planningThoughtAboutTheActionIWillTake:
                            action.planningThoughtAboutTheActionIWillTake,
                    },
                })
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(", ")}`,
            );
        });
    });

    // Write the successful tests to a file
    const testFilePath = `${trajectoriesPath}/${runId}/successfulTests-${runId}.spec.js`;
    let fileContent = `import { test } from '@playwright/test';\n\n`;

    const successfulTests = testResults.filter(
        (result) => result.status === "passed",
    );

    // Add a beforeEach test hook to goto the testurl
    fileContent += `test.beforeEach(async ({ page }) => {\n`;
    fileContent += `  await page.goto('${testUrl}');\n`;
    fileContent += `});\n\n`;

    successfulTests.forEach(({ spec, actions }) => {
        fileContent += `test("${spec}", async ({ page }) => {\n`;
        actions.forEach(({ action }) => {
            switch (action.action) {
                case "hover":
                    fileContent += `  await page.hover('${action.selector}');\n`;
                    break;
                case "click":
                    if (action.clickCount === 2) {
                        fileContent += `  await page.dblclick('${action.selector}');\n`;
                    } else {
                        fileContent += `  await page.click('${action.selector}');\n`;
                    }
                    break;
                case "fill":
                    fileContent += `  await page.fill('${action.selector}', '${action.text}');\n`;
                    break;
                case "press":
                    fileContent += `  await page.press('${action.selector}', '${action.key}');\n`;
                    break;
                case "scroll":
                    fileContent += `  await page.mouse.wheel(${action.deltaX}, ${action.deltaY});\n`;
                    break;
                case "hardWait":
                    fileContent += `  await page.waitForTimeout(${action.milliseconds});\n`;
                    break;
                case "navigate":
                    fileContent += `  await page.goto('${action.url}');\n`;
                    break;
            }
        });
        fileContent += `});\n\n`;
    });

    fs.writeFileSync(testFilePath, fileContent, "utf-8");
    logger.info(`Successful tests written to ${testFilePath}`);
}

async function loadSpecsFromFileOrStdin(specFile: string) {
    let specs: string;
    if (specFile === "-") {
        // Read from stdin
        specs = await new Promise((resolve, reject) => {
            let data = "";
            process.stdin.on("data", (chunk) => {
                data += chunk.toString();
            });
            process.stdin.on("end", () => {
                resolve(data);
            });
            process.stdin.on("error", (err) => {
                reject(err);
            });
        });
    } else {
        // Read from file
        specs = fs.readFileSync(specFile, "utf8");
    }

    const parsedSpecs = JSON.parse(specs);
    if (!Array.isArray(parsedSpecs)) {
        throw new Error("Specs file content is not an array");
    }
    parsedSpecs.forEach((spec) => {
        if (typeof spec !== "string") {
            throw new Error("Spec in file is not a string");
        }
    });

    return parsedSpecs;
}
