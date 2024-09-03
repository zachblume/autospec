import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { actionStepSchema } from "./index";
import { vi, beforeEach, describe, Mock, expect, it } from "vitest";
import winston from "winston";
import { newCompletion } from "./ai";

vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: vi.fn(() => ({})),
}));

vi.mock("ai");

beforeEach(() => {
    (createOpenAI as Mock).mockReturnValue(() => ({}));
});

describe("Stub test to make sure jest mocking is setup correctly", () => {
    it("newCompletion relies on the mockGenerateObject function", async () => {
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
            logger: winston.createLogger(),
        });
        expect(result).toEqual(whatWeExpect);
    });
});

describe("Version in CLI", () => {
    it("matches package.json", async () => {
        const packageJson = await import("../package.json");
        const cli = await import("./cli");
        expect(cli.version).toBe(packageJson.version);
    });
});
