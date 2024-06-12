#!/usr/bin/env node
// CLI entry point for the autospec package.
// This script configures and runs the autospec tool via command-line arguments.
import { main } from "./index.js";
import readline from "readline";
import inquirer from "inquirer";

const args = process.argv.slice(2);

const getArgValue = (argName, defaultValue) => {
    const index = args.indexOf(argName);
    return index !== -1 ? args[index + 1] : defaultValue;
};

if (args.includes("--help") || args.includes("-h")) {
    console.log(`
        Usage: npx autospecai --url <url> [--model <model>] [--spec_limit <limit>] [--specFile <file>] [--help | -h]

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
        --specFile <file>    Path to the file containing specs to run.
                             Use "-" to read from stdin.
    `);
    process.exit(0);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const askQuestion = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

const models = ["gpt-4o", "gemini-1.5-flash-latest", "claude-3-haiku"];

const askModelChoice = async () => {
    const { model } = await inquirer.prompt([
        {
            type: "list",
            name: "model",
            message: "Choose a model:",
            choices: models,
            default: models[0],
        },
    ]);
    return model;
};

const getInteractiveInput = async () => {
    const testUrl = await askQuestion("Enter the target URL: ");
    const modelName = await askModelChoice();
    const specLimit =
        (await askQuestion("Enter the spec limit (default: 10): ")) || 10;
    const apiKey = await askQuestion("Enter the API key: ");
    const specFile =
        (await askQuestion("Enter the spec file path (or leave blank): ")) ||
        null;

    rl.close();

    return { testUrl, modelName, specLimit, apiKey, specFile };
};

const testUrl = getArgValue("--url", null);
let modelName = getArgValue("--model", "gpt-4o");
let specLimit = getArgValue("--spec_limit", 10);
let apiKey = getArgValue("--apikey", null);
let specFile = getArgValue("--specFile", null);

if (!testUrl) {
    console.warn("No URL provided. Entering interactive mode...");
    getInteractiveInput()
        .then((inputs) => {
            main(inputs).then(console.log).catch(console.error);
        })
        .catch(console.error);
} else {
    if (!apiKey) {
        console.warn(
            "Warning: No API key provided via CLI flag --apikey. Falling back to environment variables.",
        );
    }
}

main({
    testUrl,
    modelName,
    specLimit,
    apiKey,
    specFile,
})
    .then(console.log)
    .catch(console.error);
