import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    // Look for test files in the "tests" directory, relative to this configuration file.
    testDir: "tests",
});
