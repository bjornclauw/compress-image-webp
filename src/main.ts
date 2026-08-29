import { Plugin, Notice, Editor, MarkdownView, MarkdownFileInfo } from "obsidian";
import { CompressImageSettingTab } from "./settings";
import { PluginSettings, DEFAULT_SETTINGS, ICompressImagePlugin } from "./types";
import { registerInterceptor } from "./interceptor";
import { getBatchCandidates, processBatch } from "./batch";
import { ConfirmModal, ProgressModal, BatchResultModal } from "./modals";
import { processAndInsertImages, isImageFile } from "./utils";

export default class CompressImagePlugin extends Plugin implements ICompressImagePlugin {
    settings!: PluginSettings;

    async onload() {
        await this.loadSettings();

        // Register settings tab
        this.addSettingTab(new CompressImageSettingTab(this.app, this));

        // Register live interception (paste/drop)
        registerInterceptor(this, this.settings);

        // Add ribbon icon for multiple uploads
        if (this.settings.enableMultipleUploads) {
            this.addRibbonIcon("image-plus", "Add image(s) and compress", () => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView) {
                    this.triggerImageUpload(activeView.editor, activeView);
                } else {
                    new Notice("Please open a note to insert images.");
                }
            });
        }

        // Add command palette command for batch
        this.addCommand({
            id: "convert-all-images-to-webp",
            name: "Convert all images to webp",
            callback: () => {
                void this.runBatchConversion();
            },
        });

        // Add command for multiple uploads if enabled
        if (this.settings.enableMultipleUploads) {
            this.addCommand({
                id: "compress-and-add-images",
                name: "Compress and add image(s)",
                editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
                    // Check if it's a real view or just editor info
                    if (view instanceof MarkdownView) {
                        this.triggerImageUpload(editor, view);
                    }
                },
            });
        }
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData() as Partial<PluginSettings>
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Triggers a system file picker to select multiple images,
     * then compresses and inserts them.
     */
    triggerImageUpload(editor: Editor, view: MarkdownView) {
        const input = activeDocument.body.createEl("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "image/*";

        input.onchange = async () => {
            if (!input.files || input.files.length === 0) return;

            const files = Array.from(input.files).filter(isImageFile);

            if (files.length > 0) {
                await processAndInsertImages(this, this.settings, files, editor, view);
            } else if (input.files.length > 0) {
                new Notice("No compatible images selected (non-image or unsupported format).");
            }
        };

        input.click();
    }

    async runBatchConversion() {
        const candidates = getBatchCandidates(this, this.settings);
        if (candidates.length === 0) {
            new Notice("No legacy images found to convert.");
            return;
        }

        new ConfirmModal(this.app, candidates.length, async () => {
            let aborted = false;
            const progressModal = new ProgressModal(this.app, () => {
                aborted = true;
            });
            progressModal.open();

            try {
                const result = await processBatch(
                    this,
                    this.settings,
                    candidates,
                    (completed, total) => progressModal.update(completed, total),
                    () => aborted
                );
                progressModal.close();
                new BatchResultModal(this.app, result).open();
            } catch (err) {
                console.error("Batch conversion failed", err);
                new Notice("Error during batch conversion. Check console.");
                progressModal.close();
            }
        }).open();
    }
}
