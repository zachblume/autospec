import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
const { newCompletion } = require("../src/index");

jest.mock("@ai-sdk/openai", () => ({
    createOpenAI: jest.fn(() => ({})),
}));
jest.mock("ai");

beforeEach(() => {
    createOpenAI.mockReturnValue(() => ({}));
});

describe("Stub test to make sure jest mocking is setup correctly", () => {
    test("newCompletion relies on the mockGenerateObject function", async () => {
        const whatWeExpect = { arrayOfSpecs: ["spec1", "spec23"] };
        generateObject.mockResolvedValue({ object: whatWeExpect, usage: {} });
        const { object: result } = await newCompletion({});
        expect(result).toEqual(whatWeExpect);
    });
});
