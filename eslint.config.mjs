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
];
