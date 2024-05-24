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
        
        We're continuing to focus on this spec you previously provided:
        "${spec}"

        You have an API of actions you can take:
        type Action = {
            action: String;
            x?: Number;
            y?: Number;
            string?: String;
            key?: String;
            deltaX?: Number;
            deltaY?: Number;
            milliseconds?: Number;
            reason?: String;
            fullProseExplanationOfReasoning100charmax?: String;
        }

        const possibleActions: Action[] =
        [
            { action:"moveMouseTo"; x:Number; y:Number },
            { action:"clickAtCurrentLocation" },
            { action:"doubleClickAtCurrentLocation" },
            { action:"keyboardInputString"; string:String },
            { action:"keyboardInputSingleKey"; key:String },
            { action:"scroll"; deltaX:Number; deltaY:Number },
            { action:"wait"; milliseconds: Number },
            { action:"waitForNavigation" },
            {
                action:"markSpecAsComplete";
                reason:
                  "${magicStrings.specPassed}" | "${magicStrings.specFailed}";
                fullProseExplanationOfReasoning100charmax: String
            },
        ];
        
        If the screenshot already provided you enough information to answer
        this spec completely and say that the spec has passed, you will mark the
        spec as complete with appropriate API call and reason.

        If the screenshot already provided you enough information to answer
        this spec completely and say that the spec has failed in your judgement,
        you will mark the spec as complete with appropriate API call and reason.

        You only make one API request on this turn. You only name an action
        type that was enumerated above. You only provide the parameters that
        are required for that action type enumerated above.

        A PlanActionStep is a JSON object that follows the following schema:

        type PlanActionStep =
        {
            planningThoughtAboutTheActionIWillTake: String;
            action: Action;
        }
        
        You only respond with only the JSON of the next PlanActionStep you will take
        and nothing else. You response with the JSON object only, without prefixes or
        suffixes. You never prefix it with backticks or \` or anything like that.

        Never forget that it may be necessary to hover over elements with your
        mouse or go to different pages to test the full functionality of the
        resources or their mutations that you are looking for. If you don't
        immediately see what you are looking for, before declaring a spec 
        failure, try to see if you can find it by interacting with the page
        or application a little more.

        It is extremely important that you describe coordinates based precisely
        on the screenshot you were just provided with, and never based on
        general intuition, or making up numbers as an example. You always hover
        and click towards the center of the elements you are looking for
        instead of the edges to be conservative and ensure you don't miss.

        If you find yourself taking the same action twice in a row because
        you don't think the first action was successful, you should
        vary the action slightly to see if that helps, rather than
        repeating the same action endlessly. Eventually you will need
        to mark the spec as failed if you can't find the element you
        are looking for.

        Lives are depending on your precision and accuracy in this task.

        What action you will take to comply with that test spec?
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
            if (j > 3) {
                break;
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
    // const lastMessage = messages[messages.length - 1];
    // lastMessage.content.forEach((content) => { if (content.type === "text")
    //     { logger.info(content.text); } else { logger.info(content.type);
    //     }
    // });

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
        viewport: {
            height: 512,
            width: 512,
        },
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
            caret: "initial",
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
                            // detail: "low",
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
    const actionsTaken = [];

    while (!specFulfilled && ++k < maxIterations) {
        await page.screenshot({
            path: `./trajectories/${runId}/screenshot-${k}.png`,
            caret: "initial",
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
                        // detail: "low",
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
        actionsTaken.push(action);
        await executeAction({ page, action: action.action });

        if (feedback.includes(magicStrings.specPassed)) {
            specFulfilled = true;
            testResults.push({ spec, status: "passed", actions: actionsTaken });
        } else if (feedback.includes(magicStrings.specFailed)) {
            logger.info("Spec failed");
            logger.info("Reasoning:");
            logger.info(
                action?.action?.fullProseExplanationOfReasoning100charmax,
            );
            testResults.push({
                spec,
                status: "failed",
                reason: action?.action
                    ?.fullProseExplanationOfReasoning100charmax,
                actions: actionsTaken,
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
        });
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
        case "doubleClickAtCurrentLocation":
            await page.mouse.down();
            await page.mouse.up();
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
            await page.mouse.wheel(action.deltaX, action.deltaY);
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
            console.error("Unknown action", action);
            break;
    }
}

function printTestResults() {
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
}

main().then(() => null);
