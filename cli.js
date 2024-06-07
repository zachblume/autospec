#!/usr/bin/env node

/**
 * CLI entry point for the autospec package.
 * This script configures and runs the autospec tool via command-line arguments.
 *
 * Usage:
 * npx autospec --url <url> [--model <model>] [--spec_limit <limit>] [--help | -h]
 *
 * Required:
 * --url <url>          The target URL to run the autospec tests against.
 *
 * Optional:
 * --model <model>      The model to use for spec generation. Defaults to 'gpt-4o'.
 * --spec_limit <limit> The maximum number of specs to generate. Defaults to 10.
 * --help, -h           Show this help message.
 *
 * Environment Variables Set:
 * URL                  The target URL.
 * MODEL                The model for spec generation.
 * SPEC_LIMIT           The spec limit for generation.
 *
 * The main function from index.js is invoked to execute the logic.
 */

import { main } from "./index.js";

const args = process.argv.slice(2);

const getArgValue = (argName, defaultValue) => {
    const index = args.indexOf(argName);
    return index !== -1 ? args[index + 1] : defaultValue;
};

if (args.includes("--help") || args.includes("-h")) {
    console.log(`
        Usage: npx autospec --url <url> [--model <model>] [--spec_limit <limit>] [--help | -h]

        Required:
        --url <url>          The target URL to run the autospec tests against.
        
        Optional:
        --help, -h           Show this help message.
        --spec_limit <limit> The max number of specs to generate. Default 10.
        --model <model>      The model to use for spec generation
                              * "gpt-4o" (default)
                              * "gemini-1.5-flash-latest"
                              * "claude-3-haiku"
                              * (note: Gemini flash is free up to rate limits)
        --apikey <key>       The relevant API key for the chosen model's API.
                              * If not specified, we'll fall back on the
                                following environment variables:
                                * OPENAI_API_KEY
                                * GOOGLE_GENERATIVE_AI_API_KEY
                                * ANTHROPIC_API_KEY
    `);
    process.exit(0);
}

const testUrl = getArgValue("--url", null);
if (!testUrl) {
    console.error(
        "Error: The --url argument is required.\nUse --help or -h for info.",
    );
    process.exit(1);
}

const apiKey = getArgValue("--apikey", null);
if (!apiKey) {
    console.warn(
        "Warning: No API key provided via CLI flag --apikey. Falling back to environment variables.",
    );
}

const modelName = getArgValue("--model", "gpt-4o");
const specLimit = getArgValue("--spec_limit", 10);

main({
    testUrl,
    modelName,
    specLimit,
    apiKey,
})
    .then(console.log)
    .catch(console.error);
