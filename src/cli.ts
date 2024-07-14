#!/usr/bin/env node
// CLI entry point for the autospec package.
// This script configures and runs the autospec tool via command-line arguments.
import { main } from "./index.js";
import inquirer from "inquirer";
import fs from "fs";

const args = process.argv.slice(2);

const getArgValue = <T>(argName: string, defaultValue: T) => {
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

const getVars = async () => {
    if (!getArgValue("--url", null)) {
        console.warn("No URL provided. Entering interactive mode...");
        return await getInteractiveInput();
    } else {
        return {
            testUrl: getArgValue<string | null>("--url", null),
            modelName: getArgValue<string | null>("--model", "gpt-4o"),
            specLimit: getArgValue<string | number>("--spec_limit", 10),
            apiKey: getArgValue<string | null>("--apikey", null),
            specFile: getArgValue<string | null>("--specFile", null),
        };
    }
};

const run = async () => {
    // If --version or -v is passed, print the package version and exit.
    if (args.includes("--version") || args.includes("-v")) {
        const { version } = JSON.parse(
            fs.readFileSync("./package.json", "utf8"),
        );
        console.log(`autospec version ${version}`);
        process.exit(0);
    }

    const { testUrl, modelName, specLimit, apiKey, specFile } = await getVars();
    if (!apiKey) {
        console.warn(
            "Warning: No API key provided. Falling back to environment variables.",
        );
    }
    const { testResults } = await main({
        testUrl,
        modelName,
        specLimit:
            typeof specLimit == "string" ? parseInt(specLimit) : specLimit,
        apiKey,
        specFile,
    });
    process.exit(
        testResults.every((result) => result.status === "passed") ? 0 : 1,
    );
};

run().catch(console.error);
