import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { actionStepSchema, newCompletion } from "../src/index";

jest.mock("@ai-sdk/openai", () => ({
    createOpenAI: jest.fn(() => ({})),
}));

jest.mock("ai");

beforeEach(() => {
    (createOpenAI as jest.Mock).mockReturnValue(() => ({}));
});

describe("Stub test to make sure jest mocking is setup correctly", () => {
    test("newCompletion relies on the mockGenerateObject function", async () => {
        const whatWeExpect = { arrayOfSpecs: ["spec1", "spec23"] };
        (generateObject as jest.Mock).mockResolvedValue({
            object: whatWeExpect,
            usage: {},
        });
        const { object: result } = await newCompletion({
            messages: [],
            schema: actionStepSchema,
            model: "gpt-4o",
        });
        expect(result).toEqual(whatWeExpect);
    });
});
