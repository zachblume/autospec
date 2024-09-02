// This is a wrapper module around calls to AI models.
//
// Right now, we're relying on Vercel's ai package for abstrctions that allow
// us to flip between providers like OpenAI and Google, but this is an
// additional wrapper over that.
//
// The motivation for doing so is so that we can more easily mock and also move
// away from the Vercel package if we want in the future.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { CoreMessage as CoreMessageImportedType, generateObject } from "ai";
import { z } from "zod";
import { Logger } from "winston";

export type CoreMessage = CoreMessageImportedType;

export type ModelObjectType = ReturnType<
    | ReturnType<typeof createGoogleGenerativeAI>
    | ReturnType<typeof createOpenAI>
    | ReturnType<typeof createAnthropic>
>;

export async function newCompletion({
    messages,
    schema,
    model,
    logger,
}: {
    messages: CoreMessage[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: z.ZodSchema<any>;
    model: ReturnType<
        ReturnType<
            | typeof createGoogleGenerativeAI
            | typeof createOpenAI
            | typeof createAnthropic
        >
    >;
    logger: Logger;
}): Promise<{
    object: z.infer<typeof schema>;
    completionTokens: number;
    promptTokens: number;
}> {
    const { object, usage } = await generateObject<typeof schema>({
        model,
        messages,
        temperature: 0.0,
        maxRetries: 5,
        maxTokens: 1000,
        seed: 0,
        schema,
    });

    logger.info(JSON.stringify(object, null, 4));

    const { completionTokens, promptTokens } = usage;
    return { object, completionTokens, promptTokens };
}

export const getModelConfigs = ({
    apiKey,
}: {
    apiKey?: string;
}): Record<string, ModelObjectType> => {
    return {
        "gemini-1.5-flash-latest": createGoogleGenerativeAI({
            apiKey: apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        })("models/gemini-1.5-flash-latest"),
        "gpt-4o": createOpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        })("gpt-4o"),
        "gpt-4o-mini": createOpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        })("gpt-4o-mini"),
        "claude-3-haiku": createAnthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        })("claude-3-haiku-20240307"),
    };
};
