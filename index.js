import OpenAI from "openai";
import playwright from "playwright";
import dotenv from "dotenv";
import fs from "fs";
import winston from "winston";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import { createCanvas, loadImage } from "canvas";

dotenv.config();

const testUrl = process.env.URL || "http://localhost:3000";

const openai = new OpenAI({
    // eslint-disable-next-line no-undef
    apiKey: process.env.OPENAI_API_KEY,
});

const magicStrings = {
    specPassed: "The spec passed",
    specFailed: "The spec failed",
};

const initialSystemPrompt = `
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
    - You only respond with only the JSON array of your test plan and
      nothing else, without prefixes or suffixes.
    - The array should be an array of strings, with no further object
      complexity (we will call these 'specs').
    - Covering the most amount of user journeys with the fewest amount of
      steps is the goal.

2. After the mapping and description phase, you'll be provided a spec that
   you wrote to focus on specifically, one at a time. You'll begin a loop
   executing actions in order to fulfill the spec. On each turn, you'll be
   provided a screenshot, a DOM snapshot in JSON format, and the current
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
    - You are always provided with a screenshot AND chrome developer tools
      protocol-generated DOM snapshot in JSON format, which includes offset
      rectangles to allow you to locate elements on the page.
    - You always make up appropriate cssSelectors based on the DOM
      snapshot, by relating the DOM snapshot to the screenshot you are
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
    cssSelector?: String; nth?: Number; string?: String; key?: String;
    deltaX?: Number; deltaY?: Number; milliseconds?: Number; reason?:
    String; fullProseExplanationOfReasoning100charmax?: String;
    }

    The possible actions are:
    [
        { action:"hoverOver"; cssSelector: String; nth: Number },
        { action:"clickOn", cssSelector: String; nth: Number },
        { action:"doubleClickOn"; cssSelector: String; nth: Number },
        { action:"keyboardInputString"; cssSelector: String; nth: Number; string:String },
        { action:"keyboardInputSingleKey"; cssSelector: String; nth: Number; key:String },
        { action:"scroll"; deltaX:Number; deltaY:Number },
        { action:"hardWait"; milliseconds: Number },
        { action:"gotoURL"; url: String },
        {
            action:"markSpecAsComplete";
            reason:
                "${magicStrings.specPassed}" | "${magicStrings.specFailed}";
            fullProseExplanationOfReasoning100charmax: String
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
                winston.format.printf(
                    ({ timestamp, level, message }) =>
                        `${timestamp} [${level.toUpperCase()}] - ${message}`,
                ),
            ),
        }),
    );

    const { browser, context, page, client } = await initializeBrowser({
        runId,
    });

    try {
        await visitPages({ page, runId, client });
        const { videoFrames } = await getVideoFrames({ runId });
        const { testPlan } = await createTestPlan({ videoFrames });

        let j = 0;
        for (const spec of testPlan) {
            j++;
            if (j > 10) {
                break;
            }
            await page.goto(testUrl);
            await runTestSpec({ page, runId, spec, client });
        }

        logger.info("Test complete");
    } catch (e) {
        logger.error("Test error", e);
        console.error(e);
    } finally {
        await context.close();
        await browser.close();
        logger.info("Video recording should be complete.");
        printTestResults();
    }
}

async function newCompletion({ messages }) {
    const output = await openai.chat.completions.create({
        messages,
        model: "gpt-4o",
        max_tokens: 1000,
        temperature: 0.0,
        n: 1,
        seed: 0,
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
        logger: {
            // isEnabled: (name, severity) => true,
            isEnabled: () => true,
            log: (name, severity, message) =>
                logger.info(`Playwright - ${message} [${name}] [${severity}]`),
        },
    });
    context.setDefaultTimeout(1500);
    const page = await context.newPage();
    const client = await context.newCDPSession(page);

    await page.addInitScript(() => {
        let x = 0,
            y = 0;
        document.onmousemove = (e) => {
            x = e.pageX;
            y = e.pageY;
        };
        window.getMousePosition = () => ({ x, y });
    });

    return { browser, context, page, client };
}

async function visitPages({ page, runId, client }) {
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
            path: `trajectories/${runId}/screenshot-${i}.png`,
            client,
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
                .filter((file) => file.endsWith(".png"))
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

async function runTestSpec({ page, runId, spec, client, maxIterations = 10 }) {
    let specFulfilled = false;
    let k = 0;
    const conversationHistory = [
        {
            role: "system",
            content: initialSystemPrompt,
        },
    ];
    const actionsTaken = [];

    while (!specFulfilled && ++k < maxIterations) {
        await saveScreenshotWithCursor({
            page,
            path: `./trajectories/${runId}/screenshot-${k}.png`,
            client,
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
                    text: `
                        We're continuing to focus on this spec you previously
                        provided: "${spec}"
                    `,
                },
                {
                    type: "image_url",
                    image_url: {
                        url: screenshotImageUrl,
                    },
                },
                {
                    type: "text",
                    text: `
                        Here is the DOM snapshot in JSON format:
                        \`\`\`
                        ${fs.readFileSync(
                            `./trajectories/${runId}/screenshot-${k}.json`,
                        )}
                        \`\`\`
                    `,
                },
                {
                    type: "text",
                    text: `
                        \`\`\`
                        Here is an HTML snapshot of the page:
                        ${fs.readFileSync(
                            `./trajectories/${runId}/screenshot-${k}.html`,
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

        const specFeedback = await newCompletion({
            messages: conversationHistory,
        });

        const feedback = specFeedback.choices[0].message.content;
        conversationHistory.push({
            role: "assistant",
            content: feedback,
        });

        let action;
        try {
            action = JSON.parse(feedback);
        } catch (e) {
            logger.error("Failed to parse action", feedback);
            logger.error(e);
            break;
        }
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
                            ${result.error.message}
                            \`\`\`
                        `,
                    },
                ],
            });
        }

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

async function executeAction({
    page,
    action: { action, planningThoughtAboutTheActionIWillTake },
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
            case "hoverOver":
                await page.locator(action.cssSelector).nth(action.nth).hover();
                break;
            case "clickOn":
                await page.locator(action.cssSelector).nth(action.nth).click();
                break;
            case "doubleClickOn":
                await page
                    .locator(action.cssSelector)
                    .nth(action.nth)
                    .dblclick();
                break;
            case "keyboardInputString":
                await page
                    .locator(action.cssSelector)
                    .nth(action.nth)
                    .fill(action.string);
                break;
            case "keyboardInputSingleKey":
                await page
                    .locator(action.cssSelector)
                    .nth(action.nth)
                    .press(action.key);
                break;
            case "scroll":
                await page.mouse.wheel(action.deltaX, action.deltaY);
                break;
            case "hardWait":
                await page.waitForTimeout(action.milliseconds);
                break;
            case "gotoURL":
                await page.goto(action.url);
                break;
            case "markSpecAsComplete":
                logger.info(`Spec marked as complete: ${action.reason}`);
                break;
            default:
                throw new Error(`Unknown action: ${action.action}`);
        }
        await page.waitForTimeout(50);
        return { success: true, error: null };
    } catch (error) {
        logger.error("Error executing action:", error);
        return { error, success: false };
    }
}

async function saveScreenshotWithCursor({ page, path, client }) {
    // Capture DOM snapshot
    const domSnapshot = await client.send("DOMSnapshot.captureSnapshot", {
        computedStyles: [],
        includeDOMRects: true,
        includePaintOrder: true,
    });

    // Save DOM snapshot to file
    const snapshotPath = path.replace(".png", ".json");
    fs.writeFileSync(snapshotPath, JSON.stringify(domSnapshot, null, 2));

    // Capture the HTML snapshot
    const html = await page.content();
    fs.writeFileSync(path.replace(".png", ".html"), html);

    // Capture screenshot with cursor
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
