import OpenAI from "openai";
const testUrl = "http://localhost:9999";
import playwright from "playwright";
import dotenv from "dotenv";
dotenv.config();
const openai = new OpenAI({
    // process is an global brought in by the dotenv package
    // eslint-disable-next-line no-undef
    apiKey: process.env.OPENAI_API_KEY,
});
import fs from "fs";

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

    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({
        recordVideo: {
            dir: `./trajectories/${runId}`,
            size: { width: 1280, height: 720 },
        },
    });

    try {
        const page = await context.newPage();
        await page.goto(testUrl);
        await page.waitForTimeout(1000); // Wait to capture some content

        // Let's map out the basic pages in question
        let i = 0;
        const max = 1;
        const urlsAlreadyVisited = new Set();
        const urlsToVisit = new Set([testUrl]);
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

        const videoFrames = await new Promise((resolve, reject) => {
            // We want to take the series of screenshots and convert them to
            // base64 encoded strings to send to OpenAI

            fs.readdir(`./trajectories/${runId}`, (err, files) => {
                if (err) {
                    reject(err);
                    return;
                }
                const frames = files
                    .sort()
                    .filter((file) => file.startsWith("screenshot-"))
                    .map((file) => {
                        // Return the base64 encoded string in utf-8:
                        const path = `./trajectories/${runId}/${file}`;
                        const screenshot = fs.readFileSync(path);
                        const base64utf8 = screenshot.toString("base64");
                        console.log({ base64utf8 });
                        return {
                            type: "image_url",
                            image_url: {
                                url: `data:image/png;base64,${base64utf8}`,
                                detail: "low",
                            },
                        };
                    });
                resolve(frames);
            });
        });

        console.log({ videoFrames });
        // return

        const testPlanChoices = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                // { role: "system", content: prompt }, video input:
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompts.testPlan },
                        ...videoFrames,
                    ],
                },
            ],
        });

        console.log({ testPlanChoices });

        const testPlan = testPlanChoices.choices[0].message.content;

        // Verify that the testPlan is a valid JSON array of string specs
        let testPlanJson;
        // first, extract the JSON block from the string since it's prefixed
        // with ```json and suffixed with ```
        testPlanJson = testPlan.match(/```json\n(.*?)\n```/s)[1];
        console.log(testPlanJson);
        testPlanJson = JSON.parse(testPlanJson);
        if (!Array.isArray(testPlanJson)) {
            throw new Error("Test plan is not an array");
        }
        for (const spec of testPlanJson) {
            if (typeof spec !== "string") {
                throw new Error("Test plan spec is not a string");
            }
        }

        let j = 0;
        for (const spec of testPlanJson) {
            j++
            if (j > 3) {
                throw Error("We're only allowing three specs for now.");
            }
            await page.goto(testUrl);

            // For each spec, we want to start on the homepage, take a
            // screenshot ask playwright if it looks right, waht the next step
            // is (or if the spec has been fulfilled) in the format of a
            // playwright action to evaluate, and then execute that playwright
            // action. Then we can repeat this loop until the spec is
            // fulfilled. If GPT-4o raises an error, we'll ask it to provide a
            // natural language description of the error and a suggested fix
            // and we'll stop the current spec.

            let specFulfilled = false;
            let k = 0;
            // For now, we're only allowing several spec to be fulfilled and
            // only allowing 10 iterations of the loop for cost reasons.
            while (!specFulfilled && ++k < 10) {
                await page.screenshot({
                    path: `trajectories/${runId}/screenshot-${i}.png`,
                });

                const screenshot = fs.readFileSync(
                    `./trajectories/${runId}/screenshot-${i}.png`
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

                console.log({ specFeedback });

                const feedback = specFeedback.choices[0].message.content;
                console.log({ feedback });
                if (feedback.includes(magicStrings.specPassed)) {
                    specFulfilled = true;
                } else if (feedback.includes(magicStrings.specFailed)) {
                    // Ask GPT-4o to provide a natural language description of
                    // the error and a suggested fix.
                    const errorDescription =
                        await openai.chat.completions.create({
                            model: "gpt-4o",
                            messages: [
                                {
                                    role: "user",
                                    content: [
                                        {
                                            type: "text",
                                            text: prompts.errorDescription,
                                        },
                                    ],
                                },
                            ],
                        });

                    console.log({ errorDescription });

                    const errorDescriptionText =
                        errorDescription.choices[0].message.content;

                    console.log({ errorDescriptionText });

                    // Stop the current spec and move on to the next one
                    specFulfilled = true;
                }
            }

        }

        // Otherwise, we'll exit cleanly and output a video of the entire test
        // run.
        console.log("Test complete");
    } catch (e) {
        console.error("Test error");
        console.error(e);
    } finally {
        await context.close(); // Properly close the context to save the video
        await browser.close();
        console.log("Video recording should be complete.");
    }
}

main().then(() => null);
