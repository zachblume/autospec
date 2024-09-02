import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: { ...globals.node, document: true, window: true },
        },
    },
    {
        ignores: ["build", "benchmark/examples", "trajectories"],
    },
);
