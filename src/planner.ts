import { Page } from "playwright";
import { generateText, Output } from "ai";
import { testPlanSchema } from "./schemas.js";
import { ModelInstance } from "./ai.js";
import { getAccessibilitySnapshot, saveScreenshot } from "./browser.js";

export async function visitPages({
    page,
    runId,
    testUrl,
    trajectoriesPath,
}: {
    page: Page;
    runId: string;
    testUrl: string;
    trajectoriesPath: string;
}): Promise<string[]> {
    await page.goto(testUrl);
    await page.waitForTimeout(500);

    const snapshots: string[] = [];
    const urlsAlreadyVisited = new Set<string>();
    const urlsToVisit = new Set([testUrl]);
    let i = 0;
    const max = 3;

    while (urlsToVisit.size > 0 && i < max) {
        const url = urlsToVisit.values().next().value!;
        urlsToVisit.delete(url);
        urlsAlreadyVisited.add(url);

        await page.goto(url);
        await page.waitForTimeout(300);

        await saveScreenshot({
            page,
            path: `${trajectoriesPath}/${runId}/screenshot-${i}.png`,
        });

        const snapshot = await getAccessibilitySnapshot(page);
        snapshots.push(`--- Page: ${url} ---\n${snapshot}`);

        const links = await page.$$eval("a", (as: HTMLAnchorElement[]) =>
            as.map((a: HTMLAnchorElement) => a.href),
        );
        for (const link of links) {
            if (link.startsWith(testUrl) && !urlsAlreadyVisited.has(link)) {
                urlsToVisit.add(link);
            }
        }
        i++;
    }

    return snapshots;
}

const planningSystemPrompt = `
You are an automated QA agent tasked with testing a web application.
You will be given accessibility snapshots of the application's pages.

Your job is to create a test plan: an array of specs (test cases) that
cover the most important user journeys with the fewest steps.

Guidelines:
- Formulate specs based on intended functionality, not current state.
- Don't reference specific strings or CSS — describe what the user does
  and what should happen.
- Cover happy paths, edge cases, and common interactions.
- Each spec should be a single sentence describing one testable behavior.
`;

export async function createTestPlan({
    snapshots,
    model,
}: {
    snapshots: string[];
    model: ModelInstance;
}): Promise<{
    testPlan: string[];
    promptTokens: number;
    completionTokens: number;
}> {
    const { output, usage } = await generateText({
        model,
        system: planningSystemPrompt,
        prompt: `Here are the accessibility snapshots of the application:\n\n${snapshots.join("\n\n")}\n\nCreate a test plan.`,
        output: Output.object({ schema: testPlanSchema }),
    });

    if (!output) {
        throw new Error("Failed to generate test plan — no output returned");
    }

    const testPlan = output.arrayOfSpecs;
    if (!Array.isArray(testPlan) || testPlan.length === 0) {
        throw new Error("Test plan is empty or invalid");
    }

    return {
        testPlan,
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
    };
}
