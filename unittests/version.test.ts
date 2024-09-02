import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Running CLI with --version", () => {
    it("matches package.json", async () => {
        const packageJson = await import("../package.json");
        const cli = await import("../src/cli");

        const cliVersion = cli.getVersion();
        const packageVersion = packageJson.version;

        expect(cliVersion).toBe(packageVersion);
    });
});
