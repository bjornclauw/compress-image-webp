import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { ICompressImagePlugin } from "./types";

function parseExcludedFolders(value: string): string[] {
    return value
        .split(/\r?\n|,/)
        .map((folder) => folder.trim().replace(/^\/+|\/+$/g, ""))
        .filter((folder) => folder.length > 0);
}

export class CompressImageSettingTab extends PluginSettingTab {
    plugin: ICompressImagePlugin;

    constructor(app: App, plugin: ICompressImagePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName("Image compression").setHeading();

        new Setting(containerEl)
            .setName("Max dimension")
            .setDesc("The maximum width or height of the compressed image (px).")
            .addText((text) =>
                text
                    .setPlaceholder("1600")
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
            .setDesc("Compression quality (0.0 to 1.0). Default is 0.75.")
            .addSlider((slider) =>
                slider
                    .setLimits(0.1, 1.0, 0.05)
                    .setValue(this.plugin.settings.quality)
                    .setDynamicTooltip()
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
                        this.display(); // Refresh to show/hide threshold
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
        const displayWidthIsCustom = displayWidth !== 0 && ![320, 640, 1024].includes(displayWidth);

        new Setting(containerEl)
            .setName("Image display width")
            .setDesc("Adds a display width to inserted image links, e.g. ![[image|500]]. The file itself keeps its full resolution.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("0", "Default (no width)")
                    .addOption("320", "Small (320 px)")
                    .addOption("640", "Medium (640 px)")
                    .addOption("1024", "Large (1024 px)")
                    .addOption("custom", "Custom…")
                    .setValue(displayWidthIsCustom ? "custom" : String(displayWidth))
                    .onChange(async (value) => {
                        if (value !== "custom") {
                            this.plugin.settings.editorImageDisplayWidth = parseInt(value);
                            await this.plugin.saveSettings();
                        }
                        this.display(); // show/hide the custom field
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
            .setName("Skip webp compression")
            .setDesc("When enabled, webp images are inserted as-is without re-compression (faster). Other formats still compress.")
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
