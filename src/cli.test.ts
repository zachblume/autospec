import { describe, expect, it } from "vitest";
import { createRequire } from "module";

describe("Version in CLI", () => {
    it("package.json version is valid semver", async () => {
        const require = createRequire(import.meta.url);
        const packageJson = require("../package.json");
        expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
    });
});
