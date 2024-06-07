import globals from "globals";
import pluginJs from "@eslint/js";

export default [
    {
        languageOptions: {
            globals: { ...globals.node, document: true, window: true },
        },
    },
    pluginJs.configs.recommended,
];
