import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        exclude: ["build", "node_modules", "trajectories"],
    },
});
