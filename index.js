import OpenAI from "openai";
import playwright from "playwright";
import dotenv from "dotenv";
import fs from "fs";
import winston from "winston";
import chalk from "chalk";
import stripAnsi from "strip-ansi";

dotenv.config();

const testUrl = "http://localhost:9999";

const openai = new OpenAI({
    // eslint-disable-next-line no-undef
    apiKey: process.env.OPENAI_API_KEY,
});

const magicStrings = {
    specPassed: "The spec passed",
    specFailed: "The spec failed",
};

const prompts = {
    testPlan: `
        Describe the 512x512 screenshot image I'm providing, and then provide a
        JSON array of formal checks that you will carry out as a manual QA
        software engineer who will be testing this web app.

        - You only respond with only the JSON array of your test plan and
          nothing else, without prefixes or suffixes.
        - The array should be an array of strings, with no further object
          complexity.
        - Covering the most amount of user journeys with the fewest amount of
        steps is the goal.
    `,
    specFeedback: ({ spec }) => `
        I have provided you with a 512x512 screenshot of the current state of
        the page after faithfully executing the last API call you requested.
        
        We're going to focus on this spec you provided:
        "${spec}"

        You have an API of actions you can take:
        [
            { action:"moveMouseTo", x:number, y:number },
            { action:"clickAtCurrentLocation" },
            { action:"keyboardInputString", string:string },
            { action:"keyboardInputSingleKey", key:string },
            { action:"scroll", deltaX:number, deltaY:number },
            { action:"wait", milliseconds: number },
            { action:"waitForNavigation" },
            {
                action:"markSpecAsComplete",
                reason:
                    "${magicStrings.specPassed}" | "${magicStrings.specFailed}"
            },
        ]
        
        If the screenshot already provided you enough information to answer
        this spec completely and say that the spec has passed, you will mark the
        spec as complete with appropriate API call and reason.

        If the screenshot already provided you enough information to answer
        this spec completely and say that the spec has failed in your judgement,
        you will mark the spec as complete with appropriate API call and reason.

        You only make one API request on this turn. You only name an action
        type that was enumerated above. You only provide the parameters that
        are required for that action type enumerated above.
        
        You only respond with only the JSON of the next action you will take
        and nothing else. You response with JSON only, without prefixes or
        suffixes. You never prefix it with backticks or \` or anything like that.
        
        What action you will take to comply with that test spec?
    `,
    errorDescription: `
        Please provide a natural language description of the incorrect behavior
        and a suggested fix.
    `,
};

const removeColorsFormat = winston.format((info) => {
    info.message = stripAnsi(info.message);
    return info;
});

const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}] - ${message}`;
        }),
    ),
    transports: [new winston.transports.Console()],
});

let testResults = [];

async function main() {
    const runId =
        new Date().toISOString().replace(/[^0-9]/g, "") +
        "_" +
        Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, "0");

    logger.add(
        new winston.transports.File({
            filename: `./trajectories/${runId}/combined.log`,
            format: winston.format.combine(
                removeColorsFormat(),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `${timestamp} [${level.toUpperCase()}] - ${message}`;
                }),
            ),
        }),
    );

    const { browser, context, page } = await initializeBrowser({ runId });

    try {
        await visitPages({ page, runId });
        const { videoFrames } = await getVideoFrames({ runId });
        const { testPlan } = await createTestPlan({ videoFrames });

        let j = 0;
        for (const spec of testPlan) {
            j++;
            if (j > 10) {
                throw Error("We're only allowing ten specs for now.");
            }
            await page.goto(testUrl);
            await runTestSpec({ page, runId, spec });
        }

        logger.info("Test complete");
    } catch (e) {
        logger.error("Test error", e);
    } finally {
        await context.close();
        await browser.close();
        logger.info("Video recording should be complete.");
        printTestResults();
    }
}

async function newCompletion({ messages }) {
    const lastMessage = messages[messages.length - 1];
    lastMessage.content.forEach((content) => {
        if (content.type === "text") {
            logger.info(content.text);
        } else {
            logger.info(content.type);
        }
    });

    const output = await openai.chat.completions.create({
        messages,
        model: "gpt-4o",
        max_tokens: 500,
        top_p: 1,
        temperature: 0.0,
        n: 1,
    });

    logger.info(output.choices[0].message.content);

    return output;
}

async function initializeBrowser({ runId }) {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({
        screen: {
            height: 512,
            width: 512,
        },
        recordVideo: {
            dir: `./trajectories/${runId}`,
            size: { width: 512, height: 512 },
        },
    });
    const page = await context.newPage();
    return { browser, context, page };
}

async function visitPages({ page, runId }) {
    await page.goto(testUrl);
    await page.waitForTimeout(1000);

    const urlsAlreadyVisited = new Set();
    const urlsToVisit = new Set([testUrl]);
    let i = 0;
    const max = 1;

    while (urlsToVisit.size > 0 && i < max) {
        const url = urlsToVisit.values().next().value;
        urlsToVisit.delete(url);
        urlsAlreadyVisited.add(url);
        await page.goto(url);
        await page.screenshot({
            path: `trajectories/${runId}/screenshot-${i}.png`,
        });
        const links = await page.$$eval("a", (as) => as.map((a) => a.href));
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

async function getVideoFrames({ runId }) {
    return new Promise((resolve, reject) => {
        fs.readdir(`./trajectories/${runId}`, (err, files) => {
            if (err) {
                reject(err);
                return;
            }
            const frames = files
                .sort()
                .filter((file) => file.startsWith("screenshot-"))
                .map((file) => {
                    const path = `./trajectories/${runId}/${file}`;
                    const screenshot = fs.readFileSync(path);
                    const base64utf8 = screenshot.toString("base64");
                    return {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64utf8}`,
                            detail: "low",
                        },
                    };
                });
            resolve({ videoFrames: frames });
        });
    });
}

async function createTestPlan({ videoFrames }) {
    const conversationHistory = [
        {
            role: "user",
            content: [{ type: "text", text: prompts.testPlan }, ...videoFrames],
        },
    ];

    const testPlanChoices = await newCompletion({
        messages: conversationHistory,
    });

    const testPlan = testPlanChoices.choices[0].message.content;
    const testPlanJson = JSON.parse(testPlan);

    if (!Array.isArray(testPlanJson)) {
        throw new Error("Test plan is not an array");
    }
    testPlanJson.forEach((spec) => {
        if (typeof spec !== "string") {
            throw new Error("Test plan spec is not a string");
        }
    });

    return { testPlan: testPlanJson };
}

async function runTestSpec({ page, runId, spec, maxIterations = 10 }) {
    let specFulfilled = false;
    let k = 0;
    const conversationHistory = [];

    while (!specFulfilled && ++k < maxIterations) {
        await page.screenshot({
            path: `./trajectories/${runId}/screenshot-${k}.png`,
        });

        const screenshot = fs.readFileSync(
            `./trajectories/${runId}/screenshot-${k}.png`,
        );
        const base64utf8 = screenshot.toString("base64");
        const screenshotImageUrl = `data:image/png;base64,${base64utf8}`;

        conversationHistory.push({
            role: "user",
            content: [
                {
                    type: "text",
                    text: prompts.specFeedback({ spec }),
                },
                {
                    type: "image_url",
                    image_url: {
                        url: screenshotImageUrl,
                        detail: "low",
                    },
                },
            ],
        });

        const specFeedback = await newCompletion({
            messages: conversationHistory,
        });

        const feedback = specFeedback.choices[0].message.content;
        conversationHistory.push({
            role: "assistant",
            content: feedback,
        });

        const action = JSON.parse(feedback);
        await executeAction({ page, action });

        if (feedback.includes(magicStrings.specPassed)) {
            specFulfilled = true;
            testResults.push({ spec, status: "passed" });
        } else if (feedback.includes(magicStrings.specFailed)) {
            const errorDescription = await newCompletion({
                messages: conversationHistory.concat([
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompts.errorDescription },
                        ],
                    },
                ]),
            });

            logger.info(errorDescription.choices[0].message.content);
            testResults.push({
                spec,
                status: "failed",
                reason: errorDescription.choices[0].message.content,
            });
            specFulfilled = true;
        }
    }
}

async function executeAction({ page, action }) {
    switch (action.action) {
        case "moveMouseTo":
            await page.mouse.move(action.x, action.y);
            await page.waitForTimeout(100);
            break;
        case "clickAtCurrentLocation":
            await page.mouse.down();
            await page.mouse.up();
            await page.waitForTimeout(100);
            break;
        case "keyboardInputString":
            await page.keyboard.type(action.string);
            // add 100ms delay after typing
            await page.waitForTimeout(100);
            break;
        case "keyboardInputSingleKey":
            await page.keyboard.press(action.key);
            await page.waitForTimeout(100);
            break;
        case "scroll":
            await page.wheel({ deltaX: action.deltaX, deltaY: action.deltaY });
            await page.waitForTimeout(100);
            break;
        case "wait":
            await page.waitForTimeout(action.milliseconds);
            break;
        case "waitForNavigation":
            await page.waitForNavigation();
            break;
        case "markSpecAsComplete":
            logger.info(`Spec marked as complete: ${action.reason}`);
            break;
        default:
            throw new Error(`Unknown action: ${action.action}`);
    }
}

function printTestResults() {
    logger.info("\n\n");
    logger.info(chalk.bold("Test Summary:"));

    testResults.forEach((result, index) => {
        const status =
            result.status === "passed" ? chalk.green("✔") : chalk.red("✘");
        logger.info(`${status} ${index + 1}. ${result.spec}`);
    });

    const failedTests = testResults.filter(
        (result) => result.status === "failed",
    );

    if (failedTests.length > 0) {
        logger.info(chalk.bold("\nFailures:"));
        failedTests.forEach((result, index) => {
            logger.info(chalk.red(`\n${index + 1}. ${result.spec}`));
            logger.info(result.reason);
        });
    }
}

main().then(() => null);
