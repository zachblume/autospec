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

        // We'll click all the links in the site and take screenshots and
        // provide them to GPT-4o to help it make a plan based on mapping out
        // which resources and mutations we should check by what series of
        // actions. The test plan will be formulated as an array of string
        // specs.
        //
        // Armed with the initial mapping video and test plan, we'll go through
        // each of the test plans specs and execute the most likely next
        // Playwright step one at a time. After each step, we'll take a
        // screenshot and ask GPT-4o whether or not the screenshot looks
        // correct, i.e., a boolean of whether GPT-4o would like to raise an
        // error as a manual QA agent.
        //
        // If GPT-4o raises an error, we'll ask it to provide a natural
        // language description of the error and a suggested fix.
        //
        // Otherwise, we'll exit cleanly and output a video of the entire test
        // run.

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

        // Let's provide this video to GPT-4o to generate a natural language
        // test plan, mapping out which resources and mutations we should check
        // by what series of actions. The test plan will be formulated as an
        // array of string specs.
        //     const prompt = `
        // You are a QA engineer at a software company. You have been tasked with
        // testing a website at ${testUrl}. You have been provided a video of the
        // website. Please generate a natural language test plan for the website,
        // mapping out which resources and mutations we should check by what series
        // of actions. The test plan should be formulated as an array of string specs,
        // one for each user journey you would like to test. Then, we'll execute the
        // test plan step by step and ask you again for feedback as to whether the
        // current state of the website is correct or we need to raise a flag/error
        // to the engineers to fix something.
        // `;

        const prompt = `
            Describe the screenshot image I'm providing, and then provide a
            JSON array of formal checks that you will carry out as a manual
            QA software engineer who will be testing this web app.

            - Only provide one JSON block.
            - Prefix the JSON block with ${"```"}json
            - Suffix the JSON block with ${"```"}
            - The array should be an array of strings, with
              no further object complexity.
            - Covering the most amount of user journeys with the fewest
                amount of steps is the goal.
        `;

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
                // { role: "system", content: prompt },
                // video input:
                {
                    role: "user",
                    content: [{ type: "text", text: prompt }, ...videoFrames],
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

        // Armed with the initial mapping video and test plan, we'll go through
        // each of the test plans specs and execute the most likely next
        // Playwright step one at a time. After each step, we'll take a
        // screenshot and ask GPT-4o whether or not the screenshot looks
        // correct, i.e., a boolean of whether GPT-4o would like to raise an
        // error as a manual QA agent.

        for (const spec of testPlanJson) {
            await page.goto(testUrl);

            // For each spec, we want to start on the homepage, take a screenshot
            // ask playwright if it looks right, waht the next step is (or if
            // the spec has been fulfilled) in the format of a playwright
            // action to evaluate, and then execute that playwright action.
            // Then we can repeat this loop until the spec is fulfilled.
            // If GPT-4o raises an error, we'll ask it to provide a natural
            // language description of the error and a suggested fix and we'll
            // stop the current spec.

            let specFulfilled = false;
            while (!specFulfilled) {
                await page.screenshot({
                    path: `trajectories/${runId}/screenshot-${i}.png`,
                });

                const screenshot = fs.readFileSync(
                    `./trajectories/${runId}/screenshot-${i}.png`,
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
                                    text: `
                                        Please check the screenshot below and provide feedback
                                        on whether the current state of the website is correct
                                        or if we need to raise a flag/error to the engineers to
                                        fix something.
                                    `,
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
                if (
                    feedback === "The current state of the website is correct."
                ) {
                    specFulfilled = true;
                } else {
                    // Ask GPT-4o to provide a natural language description of the
                    // error and a suggested fix.
                    const errorDescription =
                        await openai.chat.completions.create({
                            model: "gpt-4o",
                            messages: [
                                {
                                    role: "user",
                                    content: [
                                        {
                                            type: "text",
                                            text: `
                                            Please provide a natural language description of the
                                            error and a suggested fix.
                                        `,
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
