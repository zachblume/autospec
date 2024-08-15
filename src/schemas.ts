import { z } from "zod";

export const magicStrings = {
    specPassed: "The spec passed",
    specFailed: "The spec failed",
};

export const testPlanSchema = z.object({
    arrayOfSpecs: z.array(z.string()),
});

// Define schemas for each action type

// This recorder actions need to match Playwrights.
// https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/recorder/recorderActions.ts#L122
export const ClickAction = z.object({
    action: z.literal("click"),
    selector: z.string(),
    clickCount: z.number(),
    // unused
    // modifiers: z.number(),
    // button: z.literal(['left', 'middle' , 'right'])
    // position?: Point,
});

export const FillAction = z.object({
    action: z.literal("fill"),
    selector: z.string(),
    text: z.string(),
});

export const PressAction = z.object({
    action: z.literal("press"),
    selector: z.string(),
    key: z.string(),
    // unused
    // modifiers: number
});

export const NavigateAction = z.object({
    action: z.literal("navigate"),
    url: z.string(),
});

// Below this is custom actions.
export const HoverAction = z.object({
    action: z.literal("hover"),
    selector: z.string(),
});

export const ScrollAction = z.object({
    action: z.literal("scroll"),
    deltaX: z.number(),
    deltaY: z.number(),
});

export const HardWaitAction = z.object({
    action: z.literal("hardWait"),
    milliseconds: z.number(),
});

export const MarkAsCompleteAction = z.object({
    action: z.literal("markAsComplete"),
    reason: z.enum([magicStrings.specPassed, magicStrings.specFailed]),
    explanationWhySpecComplete: z.string(),
});

// Create a discriminated union of all action schemas
export const actionSchema = z.discriminatedUnion("action", [
    HoverAction,
    ClickAction,
    FillAction,
    PressAction,
    ScrollAction,
    HardWaitAction,
    NavigateAction,
    MarkAsCompleteAction,
]);

export const actionStepSchema = z.object({
    planningThoughtAboutTheActionIWillTake: z.string(),
    action: actionSchema,
});
