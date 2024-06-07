import { jest } from "@jest/globals";
jest.mock("canvas", () => {
    return {
        createCanvas: jest.fn().mockImplementation(() => {
            return {
                getContext: jest.fn().mockReturnValue({
                    drawImage: jest.fn(),
                    fillStyle: jest.fn(),
                    beginPath: jest.fn(),
                    arc: jest.fn(),
                    fill: jest.fn(),
                }),
                createPNGStream: jest.fn(() => ({
                    pipe: jest.fn(),
                })),
            };
        }),
        loadImage: jest.fn().mockResolvedValue({
            width: 1024,
            height: 1024,
        }),
    };
});
import {
    main,
    newCompletion,
    initializeBrowser,
    visitPages,
    getVideoFrames,
    createTestPlan,
    runTestSpec,
    executeAction,
    saveScreenshotWithCursor,
    printTestResults,
} from "autospecai";
// import { createAnthropic } from "@ai-sdk/anthropic";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";
// import { z } from "zod";
// import chalk from "chalk";
// import dotenv from "dotenv";
// import fs from "fs";
// import playwright from "playwright";
// import stripAnsi from "strip-ansi";
// import winston from "winston";
jest.unstable_mockModule("zod", () => {
    return {
        object: jest.fn(),
        array: jest.fn(),
        string: jest.fn(),
    };
});
const z = await import("zod");
jest.unstable_mockModule("chalk", () => {
    return {
        green: jest.fn(),
    };
});
const chalk = await import("chalk");
jest.unstable_mockModule("dotenv", () => {
    return {
        config: jest.fn(),
    };
});
const dotenv = await import("dotenv");
jest.unstable_mockModule("fs", () => {
    return {
        readdir: jest.fn(),
        readFileSync: jest.fn(),
        createWriteStream: jest.fn(),
    };
});
const fs = await import("fs");
jest.unstable_mockModule("playwright", () => {
    return {
        chromium: {
            launch: jest.fn(),
        },
    };
});
const playwright = await import("playwright");
jest.unstable_mockModule("strip-ansi", () => {
    return jest.fn();
});
const stripAnsi = await import("strip-ansi");
jest.unstable_mockModule("winston", () => {
    return {
        createLogger: jest.fn(),
    };
});
const winston = await import("winston");

jest.unstable_mockModule("@ai-sdk/openai", () => {
    return {
        createOpenAI: jest.fn(),
    };
});
const { createOpenAI } = await import("@ai-sdk/openai");

dotenv.config();

// Mock implementations for functions
const mockGenerateObject = jest.fn();
const mockBrowser = {
    newContext: jest.fn(),
    close: jest.fn(),
};
const mockContext = {
    newPage: jest.fn(),
    newCDPSession: jest.fn(),
    close: jest.fn(),
    setDefaultTimeout: jest.fn(),
};
const mockPage = {
    goto: jest.fn(),
    waitForTimeout: jest.fn(),
    locator: jest.fn(() => ({
        nth: jest.fn(() => ({
            hover: jest.fn(),
            click: jest.fn(),
            dblclick: jest.fn(),
            fill: jest.fn(),
            press: jest.fn(),
        })),
    })),
    addInitScript: jest.fn(),
    screenshot: jest.fn(),
    evaluate: jest.fn(),
    content: jest.fn(),
};
const mockClient = {};

beforeEach(() => {
    playwright.chromium.launch.mockResolvedValue(mockBrowser);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockContext.newCDPSession.mockResolvedValue(mockClient);
    mockPage.evaluate.mockResolvedValue({ x: 0, y: 0 });
    mockGenerateObject.mockResolvedValue({
        object: {
            arrayOfSpecs: ["spec1", "spec23"],
        },
    });
    // lets use openai
    createOpenAI.mockResolvedValue({
        generateObject: mockGenerateObject,
    });
});

describe("Does mocking work?", () => {
    test("mockGenerateObject is a mock function", () => {
        expect(mockGenerateObject).toBeDefined();
    });
    test("calling createOpenAI returns mockGenerateObject and generateObject works", async () => {
        const openai = await createOpenAI();
        const result = await openai.generateObject();
        expect(result).toEqual({
            object: { arrayOfSpecs: ["spec1", "spec23"] },
        });
    });
});

// describe("Main application tests", () => {
//     test("main function runs correctly", async () => {
//         await main();
//         expect(mockBrowser.newContext).toHaveBeenCalled();
//         expect(mockPage.goto).toHaveBeenCalled();
//     });

//     test("newCompletion function returns correct object", async () => {
//         const result = await newCompletion({
//             messages: [],
//             schema: z.object({ arrayOfSpecs: z.array(z.string()) }),
//             model: "mockModel",
//         });
//         expect(result).toEqual({ arrayOfSpecs: ["spec1", "spec2"] });
//     });

//     test("initializeBrowser function initializes browser correctly", async () => {
//         const result = await initializeBrowser({ runId: "testRun" });
//         expect(result).toEqual({
//             browser: mockBrowser,
//             context: mockContext,
//             page: mockPage,
//             client: mockClient,
//         });
//         expect(mockBrowser.newContext).toHaveBeenCalled();
//     });

//     test("visitPages function visits pages correctly", async () => {
//         await visitPages({
//             page: mockPage,
//             runId: "testRun",
//             client: mockClient,
//             testUrl: "http://test.com",
//         });
//         expect(mockPage.goto).toHaveBeenCalledWith("http://test.com");
//     });

//     test("getVideoFrames function retrieves frames correctly", async () => {
//         fs.readdir.mockImplementation((path, callback) => {
//             callback(null, ["frame1.png", "frame2.png"]);
//         });
//         fs.readFileSync.mockImplementation(() => "imageData");
//         const result = await getVideoFrames({ runId: "testRun" });
//         expect(result).toEqual({
//             videoFrames: [
//                 { type: "image", image: "imageData" },
//                 { type: "image", image: "imageData" },
//             ],
//         });
//     });

//     test("createTestPlan function creates test plan correctly", async () => {
//         const result = await createTestPlan({
//             videoFrames: [{ type: "image", image: "imageData" }],
//             model: "mockModel",
//         });
//         expect(result).toEqual({ testPlan: ["spec1", "spec2"] });
//     });

//     test("runTestSpec function runs spec correctly", async () => {
//         fs.readFileSync.mockImplementation(() => "htmlSnapshot");
//         await runTestSpec({
//             runId: "testRun",
//             spec: "spec1",
//             browser: mockBrowser,
//             specId: 0,
//             model: "mockModel",
//             testUrl: "http://test.com",
//         });
//         expect(mockPage.goto).toHaveBeenCalledWith("http://test.com");
//     });

//     test("executeAction function executes action correctly", async () => {
//         const action = {
//             action: "clickOn",
//             cssSelector: "button",
//             nth: 0,
//         };
//         await executeAction({
//             page: mockPage,
//             action,
//             planningThoughtAboutTheActionIWillTake: "Clicking the button",
//         });
//         expect(mockPage.locator("button").nth(0).click).toHaveBeenCalled();
//     });

//     test("saveScreenshotWithCursor saves screenshot with cursor", async () => {
//         const mockCanvas = {
//             getContext: jest.fn(() => ({
//                 drawImage: jest.fn(),
//                 fillStyle: null,
//                 beginPath: jest.fn(),
//                 arc: jest.fn(),
//                 fill: jest.fn(),
//             })),
//             createPNGStream: jest.fn(() => ({
//                 pipe: jest.fn(),
//             })),
//         };
//         createCanvas.mockReturnValue(mockCanvas);
//         const out = {
//             on: jest.fn((event, callback) => callback()),
//         };
//         fs.createWriteStream.mockReturnValue(out);

//         await saveScreenshotWithCursor({
//             page: mockPage,
//             path: "path/to/save",
//             client: mockClient,
//         });

//         expect(mockPage.screenshot).toHaveBeenCalled();
//         expect(out.on).toHaveBeenCalledWith("finish", expect.any(Function));
//     });

//     test("printTestResults prints test results correctly", () => {
//         const consoleSpy = jest.spyOn(console, "log").mockImplementation();
//         const loggerSpy = jest.spyOn(winston, "createLogger").mockReturnValue({
//             info: console.log,
//             add: jest.fn(),
//         });

//         printTestResults();

//         expect(loggerSpy).toHaveBeenCalled();
//         consoleSpy.mockRestore();
//     });
// });
