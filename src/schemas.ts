import { z } from "zod";

export const magicStrings = {
    specPassed: "The spec passed",
    specFailed: "The spec failed",
};

export const testPlanSchema = z.object({
    arrayOfSpecs: z.array(z.string()),
});

export const modelNameSchema = z.enum([
    "gpt-5.4",
    "claude-opus-4-6",
    "gemini-2.5-flash",
]);
export type ModelName = z.infer<typeof modelNameSchema>;

export type TestResult = {
    spec: string;
    status: "passed" | "failed";
    actions: ActionRecord[];
    totalInputTokens: number;
    totalOutputTokens: number;
    reason?: string;
};

export type ActionRecord = {
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
};
