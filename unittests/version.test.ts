// The version specified in cli.ts::version should be the same as package.json
import { describe, it, expect } from "vitest";

describe("Version in CLI", () => {
    it("matches package.json", async () => {
        const packageJson = await import("../package.json");
        const cli = await import("../src/cli");
        expect(cli.version).toBe(packageJson.version);
    });
});
