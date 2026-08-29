import obsidianmd from "eslint-plugin-obsidianmd";

export default [
    {
        ignores: ["node_modules/**", "main.js", "esbuild.config.mjs"],
    },
    ...obsidianmd.configs.recommended,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        files: ["src/**/*.ts"],
        rules: {
            // The declarative settings API (getSettingDefinitions) requires
            // Obsidian 1.13+; this plugin keeps the classic Setting API so it
            // can run on older versions (minAppVersion 0.15.0).
            "obsidianmd/settings-tab/prefer-setting-definitions": "off",
        },
    },
];
