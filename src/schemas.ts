import { z } from "zod";

export const magicStrings = {
    specPassed: "The spec passed",
    specFailed: "The spec failed",
};

export const testPlanSchema = z.object({
    arrayOfSpecs: z.array(z.string()),
});

// Define schemas for each action type
export const hoverOverActionSchema = z.object({
    action: z.literal("hoverOver"),
    cssSelector: z.string(),
    nth: z.number(),
});

export const clickOnActionSchema = z.object({
    action: z.literal("clickOn"),
    cssSelector: z.string(),
    nth: z.number(),
});

export const doubleClickOnActionSchema = z.object({
    action: z.literal("doubleClickOn"),
    cssSelector: z.string(),
    nth: z.number(),
});

export const keyboardInputStringActionSchema = z.object({
    action: z.literal("keyboardInputString"),
    cssSelector: z.string(),
    nth: z.number(),
    string: z.string(),
});

export const keyboardInputSingleKeyActionSchema = z.object({
    action: z.literal("keyboardInputSingleKey"),
    cssSelector: z.string(),
    nth: z.number(),
    key: z.string(),
});

export const scrollActionSchema = z.object({
    action: z.literal("scroll"),
    deltaX: z.number(),
    deltaY: z.number(),
});

export const hardWaitActionSchema = z.object({
    action: z.literal("hardWait"),
    milliseconds: z.number(),
});

export const gotoURLActionSchema = z.object({
    action: z.literal("gotoURL"),
    url: z.string(),
});

export const markSpecAsCompleteActionSchema = z.object({
    action: z.literal("markSpecAsComplete"),
    reason: z.enum([magicStrings.specPassed, magicStrings.specFailed]),
    explanationWhySpecComplete: z.string(),
});

// Create a discriminated union of all action schemas
export const actionSchema = z.discriminatedUnion("action", [
    hoverOverActionSchema,
    clickOnActionSchema,
    doubleClickOnActionSchema,
    keyboardInputStringActionSchema,
    keyboardInputSingleKeyActionSchema,
    scrollActionSchema,
    hardWaitActionSchema,
    gotoURLActionSchema,
    markSpecAsCompleteActionSchema,
]);

export const actionStepSchema = z.object({
    planningThoughtAboutTheActionIWillTake: z.string(),
    action: actionSchema,
});
