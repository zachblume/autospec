import OpenAI from "openai";
import playwright from "playwright";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const testUrl = "http://localhost:9999";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const magicStrings = {
    specPassed: "The spec passed",
    specFailed: "The spec failed",
};

const prompts = {
    testPlan: `
        Describe the screenshot image I'm providing, and then provide a JSON
        array of formal checks that you will carry out as a manual QA software
        engineer who will be testing this web app.

        - Only provide one JSON block.
        - Prefix the JSON block with \`\`\`json
        - Suffix the JSON block with \`\`\`
        - The array should be an array of strings, with no further object
          complexity.
        - Covering the most amount of user journeys with the fewest amount of
        steps is the goal.
    `,
    specFeedback: ({ spec }) => `
        I have provided you with a screenshot of the current state of the page
        after faithfully executing the last API call you requested.
        
        We're going to focus on this spec you provided:
        "${spec}"

        You have an API of actions you can take:
        [
            { action:"moveMouseTo", x:number, y:number },
            { action:"clickAtCurrentLocation" },
            { action:"keyboardInputString", string:string },
            { action:"scroll", x:number, y:number },
            { action:"wait", miliseconds: number },
            { action:"waitForNavigation" },
            { action:"screenshot" },
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

        You only make one API request on this turn.
        
        You only respond with only the JSON of the next action you will take
        and nothing else.
        
        What action you will take to comply with that test spec?
    `,
    errorDescription: `
        Please provide a natural language description of the incorrect behavior
        and a suggested fix.
    `,
};

async function main() {
    const runId = Math.random().toString(36).substring(7);
    const { browser, context, page } = await initializeBrowser({ runId });

    try {
        await visitPages({ page, runId });
        const { videoFrames } = await getVideoFrames({ runId });
        const { testPlan } = await createTestPlan({ videoFrames });

        let j = 0;
        for (const spec of testPlan) {
            j++;
            if (j > 3) {
                throw Error("We're only allowing three specs for now.");
            }
            await page.goto(testUrl);
            await runTestSpec({ page, runId, spec });
        }

        console.log("Test complete");
    } catch (e) {
        console.error("Test error", e);
    } finally {
        await context.close();
        await browser.close();
        console.log("Video recording should be complete.");
    }
}

async function initializeBrowser({ runId }) {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({
        recordVideo: {
            dir: `./trajectories/${runId}`,
            size: { width: 1280, height: 720 },
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
    const testPlanChoices = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompts.testPlan },
                    ...videoFrames,
                ],
            },
        ],
    });

    const testPlan = testPlanChoices.choices[0].message.content;
    const testPlanJson = JSON.parse(testPlan.match(/```json\n(.*?)\n```/s)[1]);

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

    while (!specFulfilled && ++k < maxIterations) {
        await page.screenshot({
            path: `trajectories/${runId}/screenshot-${k}.png`,
        });

        const screenshot = fs.readFileSync(
            `./trajectories/${runId}/screenshot-${k}.png`
        );
        const base64utf8 = screenshot.toString("base64");
        const screenshotImageUrl = `data:image/png;base64,${base64utf8}`;

        const specFeedback = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
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
                },
            ],
        });

        const feedback = specFeedback.choices[0].message.content;
        if (feedback.includes(magicStrings.specPassed)) {
            specFulfilled = true;
        } else if (feedback.includes(magicStrings.specFailed)) {
            const errorDescription = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompts.errorDescription },
                        ],
                    },
                ],
            });

            console.log(errorDescription.choices[0].message.content);
            specFulfilled = true;
        }
    }
}

main().then(() => null);
