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

const getInteractiveInput = async () => {
    const models = ["gpt-4o", "gemini-1.5-flash-latest", "claude-3-haiku"];
    const answers = await inquirer.prompt([
        {
            type: "input",
            name: "testUrl",
            message: "Enter the target URL: ",
        },
        {
            type: "list",
            name: "modelName",
            message: "Choose a model:",
            choices: models,
            default: models[0],
        },
        {
            type: "input",
            name: "specLimit",
            message: "Enter the spec limit (default: 10): ",
            default: "10",
        },
        {
            type: "input",
            name: "apiKey",
            message: "Enter the API key: ",
        },
        {
            type: "input",
            name: "specFile",
            message: "Enter the spec file path (or leave blank): ",
        },
    ]);

    return {
        testUrl: answers.testUrl,
        modelName: answers.modelName,
        specLimit: parseInt(answers.specLimit, 10) || 10,
        apiKey: answers.apiKey,
        specFile: answers.specFile || null,
    };
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
            testUrl = inputs.testUrl;
            modelName = inputs.modelName;
            specLimit = inputs.specLimit;
            apiKey = inputs.apiKey;
            specFile = inputs.specFile;
        })
        .catch(console.error)
        .finally(async () => {
            if (!apiKey) {
                console.warn(
                    "Warning: No API key provided. Falling back to environment variables.",
                );
            }
        });
}

if (!apiKey) {
    console.warn(
        "Warning: No API key provided via CLI flag --apikey. Falling back to environment variables.",
    );
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
