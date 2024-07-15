import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { actionStepSchema } from "../src/schemas";
import { newCompletion, generateCode, TestResult } from "../src";
import { vi, beforeEach, describe, Mock, test, expect } from "vitest";

vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: vi.fn(() => ({})),
}));

vi.mock("ai");

beforeEach(() => {
    (createOpenAI as Mock).mockReturnValue(() => ({}));
});

describe("Stub test to make sure jest mocking is setup correctly", () => {
    test("newCompletion relies on the mockGenerateObject function", async () => {
        const whatWeExpect = { arrayOfSpecs: ["spec1", "spec23"] };
        (generateObject as Mock).mockResolvedValue({
            object: whatWeExpect,
            usage: {},
        });
        const model = createOpenAI({
            apiKey: "example_api_key",
        })("gpt-4o");
        const { object: result } = await newCompletion({
            messages: [],
            schema: actionStepSchema,
            model,
        });
        expect(result).toEqual(whatWeExpect);
    });
});

describe("Generate code from actions", () => {
    test("Should match existing code snapshot", () => {
        const testResults: TestResult[] = [
            {
                spec: "Should be able to Edit a TODO item",
                status: "passed",
                actions: [
                    {
                        planningThoughtAboutTheActionIWillTake:
                            "Focus on the input",
                        action: {
                            action: "click" as const,
                            clickCount: 2,
                            selector: "#todo-input",
                        },
                    },
                    {
                        planningThoughtAboutTheActionIWillTake:
                            "Fill in the new value",
                        action: {
                            action: "fill" as const,
                            selector: "#todo-input",
                            text: "Buy groceries",
                        },
                    },
                    {
                        planningThoughtAboutTheActionIWillTake:
                            "Scroll to see the updated TODO Item",
                        action: {
                            action: "scroll" as const,
                            deltaX: 1200,
                            deltaY: 800,
                        },
                    },
                ],
                totalInputTokens: 1200,
                totalOutputTokens: 4503,
            },
        ];
        const testUrl = "http://google.com";

        const code = generateCode({ testResults, testUrl });

        expect(code).toMatchSnapshot();
    });
});
