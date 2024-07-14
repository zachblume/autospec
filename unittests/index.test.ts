import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { actionStepSchema, newCompletion } from "../src/index";
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
