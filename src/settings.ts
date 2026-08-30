import { App, PluginSettingTab, Setting, Notice, SettingDefinitionItem, requireApiVersion } from "obsidian";
import { ICompressImagePlugin, PluginSettings } from "./types";

function normalizeExcludedFolder(value: string): string {
    return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function parseExcludedFolders(value: string): string[] {
    return value
        .split(/\r?\n|,/)
        .map(normalizeExcludedFolder)
        .filter((folder) => folder.length > 0);
}

const WIDTH_PRESETS = [0, 320, 640, 1024];

export class CompressImageSettingTab extends PluginSettingTab {
    plugin: ICompressImagePlugin;

    constructor(app: App, plugin: ICompressImagePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Declarative settings (Obsidian 1.13+): enables the settings search and
     * is rendered instead of display() when non-empty.
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        const excludedFolders = this.plugin.settings.excludedFolders ?? [];

        return [
            {
                type: "group",
                heading: "Image compression",
                items: [
                    {
                        name: "Max dimension",
                        desc: "The maximum width or height of the compressed image (px). Default is 2000.",
                        control: { type: "number", key: "maxDimension", min: 1, max: 20000, step: 1 },
                    },
                    {
                        name: "Webp quality",
                        desc: "Compression quality (0.1 to 1.0). Default is 0.9.",
                        control: { type: "slider", key: "quality", min: 0.1, max: 1, step: 0.05 },
                    },
                    {
                        name: "Skip small files",
                        desc: "Do not compress files already smaller than a certain size.",
                        control: { type: "toggle", key: "skipSmallFiles" },
                    },
                    {
                        name: "Skip threshold (kb)",
                        desc: "Files smaller than this will be ignored by batch conversion.",
                        control: { type: "number", key: "skipThresholdKB", min: 0, step: 1 },
                        visible: () => this.plugin.settings.skipSmallFiles,
                    },
                    {
                        name: "Add timestamp",
                        desc: "Add a human-readable timestamp to the filename of compressed images.",
                        control: { type: "toggle", key: "addTimestamp" },
                    },
                    {
                        name: "Image display width",
                        desc: "Adds a display width to inserted image links, e.g. ![[image|500]]. The file itself keeps its full resolution.",
                        control: {
                            type: "dropdown",
                            key: "editorImageDisplayWidth",
                            options: {
                                "0": "Default (no width)",
                                "320": "Small (320 px)",
                                "640": "Medium (640 px)",
                                "1024": "Large (1024 px)",
                                "custom": "Custom…",
                            },
                        },
                    },
                    {
                        name: "Custom display width (px)",
                        desc: "Width in pixels used for inserted image links.",
                        control: { type: "number", key: "editorImageDisplayWidthCustom", min: 0, step: 1 },
                        visible: () => {
                            const w = this.plugin.settings.editorImageDisplayWidth ?? 0;
                            return !WIDTH_PRESETS.includes(w);
                        },
                    },
                    {
                        name: "Enable multiple uploads command",
                        desc: "Adds a command 'compress and add image(s)' that allows selecting multiple files via system picker.",
                        control: { type: "toggle", key: "enableMultipleUploads" },
                    },
                    {
                        name: "Skip efficient formats",
                        desc: "When enabled, webp, avif and heic/heif images are inserted as-is without re-compression (faster). Other formats still compress.",
                        control: { type: "toggle", key: "skipWebpCompression" },
                    },
                ],
            },
            {
                type: "list",
                heading: "Excluded folders",
                items: excludedFolders.map((_, index) => ({
                    name: "Excluded folder",
                    desc: "Images in this folder are never compressed.",
                    control: {
                        type: "folder",
                        key: `excludedFolder:${index}`,
                        placeholder: "Folder",
                    },
                })),
                emptyState: "No excluded folders. Images everywhere in the vault are compressed.",
                onDelete: (index) => {
                    this.plugin.settings.excludedFolders?.splice(index, 1);
                    void this.plugin.saveSettings();
                    this.refreshSettingDefinitions();
                },
                onReorder: (oldIndex, newIndex) => {
                    const folders = this.plugin.settings.excludedFolders;
                    if (!folders) return;
                    const [moved] = folders.splice(oldIndex, 1);
                    folders.splice(newIndex, 0, moved);
                    void this.plugin.saveSettings();
                    this.refreshSettingDefinitions();
                },
                addItem: {
                    name: "Add excluded folder",
                    action: () => {
                        (this.plugin.settings.excludedFolders ??= []).push("");
                        void this.plugin.saveSettings();
                        this.refreshSettingDefinitions();
                    },
                },
            },
        ];
    }

    /**
     * Structural changes (add/delete/reorder rows) need a full re-render of
     * the definitions; only the declarative framework can trigger those.
     */
    private refreshSettingDefinitions(): void {
        if (requireApiVersion("1.13.0")) {
            this.update();
        }
    }

    getControlValue(key: string): unknown {
        const s = this.plugin.settings;
        switch (key) {
            case "excludedFolders":
                return (s.excludedFolders ?? []).join("\n");
            case "editorImageDisplayWidth": {
                const w = s.editorImageDisplayWidth ?? 0;
                return WIDTH_PRESETS.includes(w) ? String(w) : "custom";
            }
            case "editorImageDisplayWidthCustom":
                return s.editorImageDisplayWidth ?? 0;
            default:
                if (key.startsWith("excludedFolder:")) {
                    const index = parseInt(key.slice("excludedFolder:".length), 10);
                    return s.excludedFolders?.[index] ?? "";
                }
                return s[key as keyof PluginSettings];
        }
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const s = this.plugin.settings;
        const asNumber = (): number => (typeof value === "number" ? value : parseInt(String(value), 10));

        switch (key) {
            case "maxDimension":
                if (!isNaN(asNumber())) s.maxDimension = Math.max(1, Math.min(20000, asNumber()));
                break;
            case "quality":
                if (typeof value === "number") s.quality = value;
                break;
            case "skipThresholdKB":
                if (!isNaN(asNumber())) s.skipThresholdKB = Math.max(0, asNumber());
                break;
            case "editorImageDisplayWidth":
                if (value === "custom") {
                    // Selecting Custom with a preset active seeds the custom field
                    if (WIDTH_PRESETS.includes(s.editorImageDisplayWidth ?? 0)) {
                        s.editorImageDisplayWidth = 500;
                    }
                } else if (!isNaN(parseInt(String(value), 10))) {
                    s.editorImageDisplayWidth = parseInt(String(value), 10);
                }
                break;
            case "editorImageDisplayWidthCustom":
                if (!isNaN(asNumber())) s.editorImageDisplayWidth = Math.max(0, asNumber());
                break;
            case "excludedFolders":
                s.excludedFolders = parseExcludedFolders(String(value));
                break;
            default:
                if (key.startsWith("excludedFolder:")) {
                    const index = parseInt(key.slice("excludedFolder:".length), 10);
                    if (!s.excludedFolders) s.excludedFolders = [];
                    s.excludedFolders[index] = normalizeExcludedFolder(String(value));
                }
                break;
            case "skipSmallFiles":
            case "addTimestamp":
            case "enableMultipleUploads":
            case "skipWebpCompression":
                if (typeof value === "boolean") s[key] = value;
                break;
        }

        await this.plugin.saveSettings();

        // Structural change: the conditional custom-width row appears/disappears.
        // setControlValue is only invoked by the declarative framework (1.13+),
        // but guard explicitly for the static API checks.
        if (requireApiVersion("1.13.0")) {
            if (key === "editorImageDisplayWidth") {
                this.update();
            } else if (key === "skipSmallFiles") {
                this.refreshDomState();
            }
        }
    }

    /**
     * Legacy imperative rendering, used by Obsidian versions older than 1.13.
     * Not called when getSettingDefinitions() returns a non-empty array.
     */
    display(): void {
        this.renderLegacySettings();
    }

    private renderLegacySettings(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName("Image compression").setHeading();

        new Setting(containerEl)
            .setName("Max dimension")
            .setDesc("The maximum width or height of the compressed image (px). Default is 2000.")
            .addText((text) =>
                text
                    .setPlaceholder("2000")
                    .setValue(this.plugin.settings.maxDimension.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num)) {
                            this.plugin.settings.maxDimension = Math.max(1, Math.min(20000, num));
                            await this.plugin.saveSettings();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Webp quality")
            .setDesc("Compression quality (0.1 to 1.0). Default is 0.9.")
            .addSlider((slider) =>
                slider
                    .setLimits(0.1, 1.0, 0.05)
                    .setValue(this.plugin.settings.quality)
                    .onChange(async (value) => {
                        this.plugin.settings.quality = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Skip small files")
            .setDesc("Do not compress files already smaller than a certain size.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.skipSmallFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.skipSmallFiles = value;
                        await this.plugin.saveSettings();
                        this.renderLegacySettings(); // Refresh to show/hide threshold
                    })
            );

        if (this.plugin.settings.skipSmallFiles) {
            new Setting(containerEl)
                .setName("Skip threshold (kb)")
                .setDesc("Files smaller than this will be ignored by batch conversion.")
                .addText((text) =>
                    text
                        .setPlaceholder("200")
                        .setValue(this.plugin.settings.skipThresholdKB.toString())
                        .onChange(async (value) => {
                            const num = parseInt(value);
                            if (!isNaN(num)) {
                                this.plugin.settings.skipThresholdKB = Math.max(0, num);
                                await this.plugin.saveSettings();
                            }
                        })
                );
        }

        new Setting(containerEl)
            .setName("Add timestamp")
            .setDesc("Add a human-readable timestamp to the filename of compressed images.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.addTimestamp)
                    .onChange(async (value) => {
                        this.plugin.settings.addTimestamp = value;
                        await this.plugin.saveSettings();
                    })
            );

        const displayWidth = this.plugin.settings.editorImageDisplayWidth ?? 0;
        const displayWidthIsCustom = !WIDTH_PRESETS.includes(displayWidth);

        new Setting(containerEl)
            .setName("Image display width")
            .setDesc("Adds a display width to inserted image links, e.g. ![[image|500]]. The file itself keeps its full resolution.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        "0": "Default (no width)",
                        "320": "Small (320 px)",
                        "640": "Medium (640 px)",
                        "1024": "Large (1024 px)",
                        "custom": "Custom…",
                    })
                    .setValue(displayWidthIsCustom ? "custom" : String(displayWidth))
                    .onChange(async (value) => {
                        if (value !== "custom") {
                            this.plugin.settings.editorImageDisplayWidth = parseInt(value);
                            await this.plugin.saveSettings();
                        }
                        this.renderLegacySettings(); // show/hide the custom field
                    })
            );

        if (displayWidthIsCustom) {
            new Setting(containerEl)
                .setName("Custom display width (px)")
                .setDesc("Width in pixels used for inserted image links.")
                .addText((text) =>
                    text
                        .setPlaceholder("500")
                        .setValue(String(displayWidth))
                        .onChange(async (value) => {
                            const num = parseInt(value);
                            if (!isNaN(num)) {
                                this.plugin.settings.editorImageDisplayWidth = Math.max(0, num);
                                await this.plugin.saveSettings();
                            }
                        })
                );
        }

        new Setting(containerEl)
            .setName("Enable multiple uploads command")
            .setDesc("Adds a command 'compress and add image(s)' that allows selecting multiple files via system picker.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableMultipleUploads)
                    .onChange(async (value) => {
                        this.plugin.settings.enableMultipleUploads = value;
                        await this.plugin.saveSettings();
                        new Notice("Restart Obsidian or reload the plugin for command changes to take effect.");
                    })
            );

        new Setting(containerEl)
            .setName("Skip efficient formats")
            .setDesc("When enabled, webp, avif and heic/heif images are inserted as-is without re-compression (faster). Other formats still compress.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.skipWebpCompression)
                    .onChange(async (value) => {
                        this.plugin.settings.skipWebpCompression = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Excluded folders")
            .setDesc("Vault-relative folders to keep untouched during batch conversion. Add one folder per line.")
            .addTextArea((text) =>
                text
                    .setPlaceholder("High res drawings\ninstruction images/source")
                    .setValue((this.plugin.settings.excludedFolders ?? []).join("\n"))
                    .onChange(async (value) => {
                        this.plugin.settings.excludedFolders = parseExcludedFolders(value);
                        await this.plugin.saveSettings();
                    })
            );
    }
}
