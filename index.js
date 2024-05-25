import OpenAI from "openai";
import playwright from "playwright";
import dotenv from "dotenv";
import fs from "fs";
import winston from "winston";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import { createCanvas, loadImage } from "canvas";

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
    specFeedback: ({ spec, currentX, currentY }) => `
        I have provided you with a 1024x1024 screenshot of the current state of
        the page after faithfully executing the last API call you requested.

        The red dot in the screenshot is your current mouse cursor position. 
        I can tell you that the X and Y coordinates of the mouse cursor are
        (${currentX}, ${currentY}) in the 1024x1024 coordinate system.

        Focus on inputs is not always clearly visible. You always check that
        the mouse cursor is correctly positioned over the target element before
        you proceed with any clicking or typing actions. If the cursor is not 
        correctly positioned, you must adjust it first. 

        Ignore any irrelevant text or elements on the page that do not pertain
        to the current spec and step you're trying to reason about. Your goal
        is to interact only with the elements necessary to fulfill the current
        spec.

        There is an overlaid grid on the screenshot that is not part of the
        actual screenshot. It is only there to help you reason about the
        coordinates of the screenshot. Each grid box is 32x32 pixels.

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
        and nothing else. You respond with the JSON object only, without prefixes or
        suffixes. You never prefix it with backticks or \` or anything like that.

        Never forget that it may be necessary to hover over elements with your
        mouse or go to different pages to test the full functionality of the
        resources or their mutations that you are looking for. If you don't
        immediately see what you are looking for, before declaring a spec 
        failure, try to see if you can find it by interacting with the page
        or application a little more.

        You always adjust your mouse position to the correct location before
        clicking or proceeding with interactions if it seems like your mouse
        position is off.
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
    // // log the type==="text" content items of the last message
    // lastMessage.content
    //     .filter((item) => item.type === "text")
    //     .forEach((item) => logger.info(item.text));

    const output = await openai.chat.completions.create({
        messages,
        model: "gpt-4o",
        max_tokens: 500,
        // top_p: 1,
        // temperature: 0.0,
        n: 1,
    });

    logger.info(output.choices[0].message.content);

    return output;
}

async function initializeBrowser({ runId }) {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({
        viewport: {
            height: 1024,
            width: 1024,
        },
        screen: {
            height: 1024,
            width: 1024,
        },
        recordVideo: {
            dir: `./trajectories/${runId}`,
            size: { width: 1024, height: 1024 },
        },
    });
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
        await saveScreenshotWithCursor({
            page,
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
        await saveScreenshotWithCursor({
            page,
            path: `./trajectories/${runId}/screenshot-${k}.png`,
        });

        const screenshot = fs.readFileSync(
            `./trajectories/${runId}/screenshot-${k}.png`,
        );
        const base64utf8 = screenshot.toString("base64");
        const screenshotImageUrl = `data:image/png;base64,${base64utf8}`;

        const { x: currentX, y: currentY } = await page.evaluate(() =>
            window.getMousePosition(),
        );
        logger.info(`Current mouse position: (${currentX}, ${currentY})`);

        conversationHistory.push({
            role: "user",
            content: [
                {
                    type: "text",
                    text: prompts.specFeedback({ spec, currentX, currentY }),
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

async function saveScreenshotWithCursor({ page, path }) {
    // TODO: if the page is navigating while page.evaluate is running, it will throw an error
    const { x, y } = await page.evaluate(() => window.getMousePosition());
    const screenshotBuffer = await page.screenshot();
    const img = await loadImage(screenshotBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Add grid of 32x32 pixels and label each box with its coordinates
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 1;
    for (let i = 0; i < img.width; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, img.height);
        ctx.stroke();
    }
    for (let i = 0; i < img.height; i += 32) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(img.width, i);
        ctx.stroke();
    }
    for (let i = 0; i < img.width; i += 32) {
        for (let j = 0; j < img.height; j += 32) {
            ctx.font = "5px Arial";
            // ctx.fillStyle = "black";
            // make it somewhat transparent
            ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
            ctx.fillText(`${i},${j}`, i + 2, j + 10);
        }
    }

    const out = fs.createWriteStream(path);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    await new Promise((resolve) => out.on("finish", resolve));
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
