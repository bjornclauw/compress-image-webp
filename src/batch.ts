import { Plugin, TFile } from "obsidian";
import { PluginSettings } from "./types";
import { compressToWebP, isAnimatedGif } from "./compress";
import { isPathInExcludedFolder } from "./exclusions";

export interface BatchResult {
    converted: number;
    skippedSmall: number;
    skippedAnimated: number;
    errorPaths: string[];
    bytesBefore: number;
    bytesAfter: number;
    durationMs: number;
    cancelled: boolean;
}

export function getBatchCandidates(plugin: Plugin, settings: PluginSettings): TFile[] {
    // TIFF is excluded: Chromium's createImageBitmap cannot decode it, so
    // conversion would always fail.
    return plugin.app.vault.getFiles().filter((file) => {
        const ext = file.extension.toLowerCase();
        return ["png", "jpg", "jpeg", "bmp", "gif"].includes(ext)
            && !isPathInExcludedFolder(file.path, settings.excludedFolders);
    });
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export async function processBatch(
    plugin: Plugin,
    settings: PluginSettings,
    files: TFile[],
    onProgress: (completed: number, total: number) => void,
    shouldAbort?: () => boolean
): Promise<BatchResult> {
    const result: BatchResult = {
        converted: 0,
        skippedSmall: 0,
        skippedAnimated: 0,
        errorPaths: [],
        bytesBefore: 0,
        bytesAfter: 0,
        durationMs: 0,
        cancelled: false,
    };
    const startedAt = Date.now();

    for (let i = 0; i < files.length; i++) {
        if (shouldAbort?.()) {
            result.cancelled = true;
            result.durationMs = Date.now() - startedAt;
            return result;
        }

        const file = files[i];

        try {
            // 1. Read original
            const data = await plugin.app.vault.readBinary(file);

            // Skip small files if enabled
            if (settings.skipSmallFiles && data.byteLength < settings.skipThresholdKB * 1024) {
                result.skippedSmall++;
                onProgress(i + 1, files.length);
                continue;
            }

            const blob = new Blob([data], { type: `image/${file.extension}` });

            // Animated GIFs would lose their animation, so leave them as-is
            if (file.extension.toLowerCase() === "gif" && await isAnimatedGif(blob)) {
                result.skippedAnimated++;
                onProgress(i + 1, files.length);
                continue;
            }

            // 2. Compress to WebP
            const compressedBuffer = await compressToWebP(blob, settings);
            const beforeSize = data.byteLength;
            const afterSize = compressedBuffer.byteLength;

            // 3. Pick a .webp path that is not taken yet. Checking before any
            // write guarantees we never overwrite another file and never leave
            // the original as a corrupt PNG if the rename fails.
            const basePath = file.path.substring(0, file.path.lastIndexOf(".")) + ".webp";
            const baseName = basePath.substring(0, basePath.length - 5); // strip ".webp"
            let newPath = basePath;
            let suffix = 1;
            while (plugin.app.vault.getAbstractFileByPath(newPath)) {
                newPath = `${baseName} ${suffix}.webp`;
                suffix++;
            }

            // 4. Modify binary (overwrite original with webp data), then rename.
            // Important: We modify binary first, then rename. This is safer for sidecars.
            await plugin.app.vault.modifyBinary(file, compressedBuffer);

            // 5. Rename to .webp
            // Use fileManager.renameFile so Obsidian updates all internal links
            await plugin.app.fileManager.renameFile(file, newPath);

            result.converted++;
            result.bytesBefore += beforeSize;
            result.bytesAfter += afterSize;
        } catch (err) {
            console.error(`Failed to process ${file.path}:`, err);
            result.errorPaths.push(file.path);
        }

        onProgress(i + 1, files.length);
    }

    result.durationMs = Date.now() - startedAt;
    return result;
}
