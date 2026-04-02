import { z } from "zod";
import { generateText, tool, stepCountIs, hasToolCall } from "ai";
import { Browser } from "playwright";
import { ModelInstance } from "./ai.js";
import { initializeBrowser, getAccessibilitySnapshot } from "./browser.js";
import { magicStrings, type TestResult, type ActionRecord } from "./schemas.js";

const executionSystemPrompt = `
You are an automated QA agent executing a specific test spec on a web application.

You interact with the page using the provided tools. After each tool call,
you'll receive the updated accessibility snapshot of the page so you can
decide your next action.

Guidelines:
- Use semantic locators: identify elements by their role and accessible name
  (e.g., role="button", name="Submit") or by their label text.
- If you can't find an element, try scrolling, navigating, or hovering to
  reveal it before declaring failure.
- When the spec is fulfilled or clearly broken, call mark_complete.
- Be methodical: one action at a time, observe the result, then decide next.
`;

function createBrowserTools(page: import("playwright").Page) {
    return {
        click: tool({
            description:
                "Click on an element by its ARIA role and accessible name.",
            inputSchema: z.object({
                role: z
                    .string()
                    .describe(
                        "ARIA role: button, link, checkbox, textbox, menuitem, tab, heading, etc.",
                    ),
                name: z
                    .string()
                    .describe("The accessible name or text of the element."),
            }),
            execute: async ({ role, name }) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await page.getByRole(role as any, { name }).click();
                await page.waitForTimeout(100);
                return {
                    success: true,
                    snapshot: await getAccessibilitySnapshot(page),
                };
            },
        }),

        fill: tool({
            description:
                "Type text into an input field identified by its label or placeholder.",
            inputSchema: z.object({
                label: z
                    .string()
                    .describe(
                        "The label, placeholder, or accessible name of the input.",
                    ),
                value: z.string().describe("The text to type."),
            }),
            execute: async ({ label, value }) => {
                // Try getByLabel first, fall back to getByPlaceholder
                try {
                    await page.getByLabel(label).fill(value);
                } catch {
                    try {
                        await page.getByPlaceholder(label).fill(value);
                    } catch (e) {
                        return {
                            success: false,
                            error: `Could not find input with label or placeholder "${label}": ${e instanceof Error ? e.message : String(e)}`,
                            snapshot: await getAccessibilitySnapshot(page),
                        };
                    }
                }
                await page.waitForTimeout(100);
                return {
                    success: true,
                    snapshot: await getAccessibilitySnapshot(page),
                };
            },
        }),

        press_key: tool({
            description:
                "Press a keyboard key (Enter, Tab, Escape, etc.) on a focused element or the page.",
            inputSchema: z.object({
                key: z
                    .string()
                    .describe(
                        'The key to press (e.g., "Enter", "Tab", "Escape", "Backspace").',
                    ),
            }),
            execute: async ({ key }) => {
                await page.keyboard.press(key);
                await page.waitForTimeout(100);
                return {
                    success: true,
                    snapshot: await getAccessibilitySnapshot(page),
                };
            },
        }),

        hover: tool({
            description:
                "Hover over an element by its ARIA role and accessible name.",
            inputSchema: z.object({
                role: z.string().describe("ARIA role of the element."),
                name: z
                    .string()
                    .describe("The accessible name of the element."),
            }),
            execute: async ({ role, name }) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await page.getByRole(role as any, { name }).hover();
                await page.waitForTimeout(100);
                return {
                    success: true,
                    snapshot: await getAccessibilitySnapshot(page),
                };
            },
        }),

        scroll: tool({
            description: "Scroll the page by a given amount.",
            inputSchema: z.object({
                deltaX: z
                    .number()
                    .describe("Horizontal scroll amount in pixels."),
                deltaY: z
                    .number()
                    .describe(
                        "Vertical scroll amount in pixels (positive = down).",
                    ),
            }),
            execute: async ({ deltaX, deltaY }) => {
                await page.mouse.wheel(deltaX, deltaY);
                await page.waitForTimeout(200);
                return {
                    success: true,
                    snapshot: await getAccessibilitySnapshot(page),
                };
            },
        }),

        navigate: tool({
            description: "Navigate to a URL.",
            inputSchema: z.object({
                url: z.string().describe("The URL to navigate to."),
            }),
            execute: async ({ url }) => {
                await page.goto(url);
                await page.waitForTimeout(300);
                return {
                    success: true,
                    snapshot: await getAccessibilitySnapshot(page),
                };
            },
        }),

        wait: tool({
            description:
                "Wait for a specified duration (use sparingly, only when content needs time to load).",
            inputSchema: z.object({
                milliseconds: z
                    .number()
                    .describe("Duration to wait in milliseconds (max 5000)."),
            }),
            execute: async ({ milliseconds }) => {
                await page.waitForTimeout(Math.min(milliseconds, 5000));
                return {
                    success: true,
                    snapshot: await getAccessibilitySnapshot(page),
                };
            },
        }),

        get_by_text: tool({
            description:
                "Click on an element identified by its visible text content. Use when role-based selection isn't specific enough.",
            inputSchema: z.object({
                text: z
                    .string()
                    .describe("The visible text of the element to click."),
                exact: z
                    .boolean()
                    .optional()
                    .describe(
                        "Whether to match text exactly (default: false, substring match).",
                    ),
            }),
            execute: async ({ text, exact }) => {
                await page
                    .getByText(text, { exact: exact ?? false })
                    .click();
                await page.waitForTimeout(100);
                return {
                    success: true,
                    snapshot: await getAccessibilitySnapshot(page),
                };
            },
        }),

        mark_complete: tool({
            description:
                "Mark the current spec as passed or failed. Call this when you have enough evidence to make a judgment.",
            inputSchema: z.object({
                result: z
                    .enum([magicStrings.specPassed, magicStrings.specFailed])
                    .describe("Whether the spec passed or failed."),
                explanation: z
                    .string()
                    .describe(
                        "Detailed explanation of why the spec passed or failed.",
                    ),
            }),
            execute: async ({ result, explanation }) => {
                return { completed: true, result, explanation };
            },
        }),
    };
}

export async function runTestSpec({
    runId,
    spec,
    browser,
    maxSteps = 15,
    model,
    testUrl,
    trajectoriesPath,
    recordVideo = true,
}: {
    runId: string;
    spec: string;
    browser: Browser;
    maxSteps?: number;
    model: ModelInstance;
    testUrl: string;
    trajectoriesPath: string;
    recordVideo?: boolean;
}): Promise<TestResult> {
    // Each spec gets its own isolated browser context
    const { page, context } = await initializeBrowser({
        runId,
        browser,
        testUrl,
        trajectoriesPath,
        recordVideo,
    });

    const actions: ActionRecord[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
        await page.goto(testUrl);
        await page.waitForTimeout(300);

        const initialSnapshot = await getAccessibilitySnapshot(page);
        const tools = createBrowserTools(page);

        await generateText({
            model,
            system: executionSystemPrompt,
            prompt: `Execute this spec: "${spec}"\n\nCurrent page URL: ${testUrl}\n\nCurrent page accessibility snapshot:\n${initialSnapshot}`,
            tools,
            stopWhen: [
                stepCountIs(maxSteps),
                hasToolCall("mark_complete"),
            ],
            onStepFinish: (event) => {
                totalInputTokens += event.usage.inputTokens ?? 0;
                totalOutputTokens += event.usage.outputTokens ?? 0;

                for (const tc of event.toolCalls) {
                    const matchingResult = event.toolResults.find(
                        (tr) => tr.toolCallId === tc.toolCallId,
                    );
                    actions.push({
                        tool: tc.toolName,
                        args: tc.input as Record<string, unknown>,
                        result: matchingResult?.output,
                    });
                }
            },
        });

        // Find the mark_complete call to determine pass/fail
        const completionAction = actions.find(
            (a) => a.tool === "mark_complete",
        );

        if (completionAction) {
            const result = completionAction.result as {
                completed: boolean;
                result: string;
                explanation: string;
            };
            const passed = result.result === magicStrings.specPassed;
            return {
                spec,
                status: passed ? "passed" : "failed",
                reason: result.explanation,
                actions,
                totalInputTokens,
                totalOutputTokens,
            };
        }

        // Max steps exhausted without mark_complete
        return {
            spec,
            status: "failed",
            reason: `Max steps (${maxSteps}) reached without completing the spec`,
            actions,
            totalInputTokens,
            totalOutputTokens,
        };
    } catch (error) {
        return {
            spec,
            status: "failed",
            reason:
                error instanceof Error ? error.message : JSON.stringify(error),
            actions,
            totalInputTokens,
            totalOutputTokens,
        };
    } finally {
        await context.close();
    }
}
