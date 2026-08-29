import { App, Modal, Setting } from "obsidian";
import { BatchResult, formatBytes } from "./batch";

export class ConfirmModal extends Modal {
    count: number;
    onConfirm: () => Promise<void>;

    constructor(app: App, count: number, onConfirm: () => Promise<void>) {
        super(app);
        this.count = count;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Convert images to webp" });
        contentEl.createEl("p", {
            text: `Found ${this.count} legacy images. This will compress them to WebP and update all internal links. Animated GIFs are left untouched. This action is permanent (but you should have a backup).`,
        });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Confirm")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        void this.onConfirm();
                    })
            )
            .addButton((btn) =>
                btn.setButtonText("Cancel").onClick(() => {
                    this.close();
                })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class ProgressModal extends Modal {
    progressEl!: HTMLDivElement;
    statusEl!: HTMLDivElement;
    onCancel?: () => void;

    constructor(app: App, onCancel?: () => void) {
        super(app);
        this.onCancel = onCancel;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Processing images..." });
        this.statusEl = contentEl.createDiv({ text: "Starting..." });

        const meterContainer = contentEl.createDiv({ cls: "compress-progress-meter" });
        this.progressEl = meterContainer.createDiv({ cls: "compress-progress-fill" });

        if (this.onCancel) {
            new Setting(contentEl).addButton((btn) =>
                btn.setButtonText("Cancel").onClick(() => {
                    this.onCancel?.();
                    this.close();
                })
            );
        }
    }

    update(completed: number, total: number) {
        const pct = total > 0 ? Math.round((completed / total) * 100) : 100;
        this.statusEl.setText(`Processed ${completed} of ${total} (${pct}%)`);
        this.progressEl.style.width = `${pct}%`;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class BatchResultModal extends Modal {
    result: BatchResult;

    constructor(app: App, result: BatchResult) {
        super(app);
        this.result = result;
    }

    onOpen() {
        const { contentEl } = this;
        const r = this.result;

        contentEl.createEl("h2", {
            text: r.cancelled ? "Batch conversion cancelled" : "Batch conversion complete",
        });

        const stats = contentEl.createDiv({ cls: "compress-result-stats" });
        const addRow = (label: string, value: string) => {
            const row = stats.createDiv({ cls: "compress-result-row" });
            row.createSpan({ text: label });
            row.createSpan({ text: value, cls: "compress-result-value" });
        };

        addRow("Converted", `${r.converted}`);
        if (r.skippedSmall > 0) {
            addRow("Skipped (small files)", `${r.skippedSmall}`);
        }
        if (r.skippedAnimated > 0) {
            addRow("Skipped (animated gif)", `${r.skippedAnimated}`);
        }
        if (r.converted > 0) {
            const saved = r.bytesBefore - r.bytesAfter;
            if (saved > 0 && r.bytesBefore > 0) {
                const pct = Math.round((saved / r.bytesBefore) * 100);
                addRow("Space saved", `${formatBytes(saved)} (${pct}%)`);
            } else if (r.bytesBefore > 0) {
                addRow("Size change", `+${formatBytes(r.bytesAfter - r.bytesBefore)}`);
            }
            addRow("Duration", `${(r.durationMs / 1000).toFixed(1)} s`);
        }
        if (r.cancelled) {
            addRow("Duration", `${(r.durationMs / 1000).toFixed(1)} s`);
        }

        if (r.errorPaths.length > 0) {
            const errorsWrap = contentEl.createDiv({ cls: "compress-result-errors" });
            errorsWrap.createEl("h3", { text: `Errors (${r.errorPaths.length})` });
            const list = errorsWrap.createEl("ul");
            for (const path of r.errorPaths) {
                list.createEl("li", { text: path });
            }
        }

        new Setting(contentEl).addButton((btn) =>
            btn.setButtonText("Close").setCta().onClick(() => this.close())
        );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
