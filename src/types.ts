import { Plugin, TFile, TFolder } from "obsidian";

export interface PluginSettings {
    maxDimension: number;
    quality: number;
    skipSmallFiles: boolean;
    skipThresholdKB: number;
    addTimestamp: boolean;
    enableMultipleUploads: boolean;
    skipWebpCompression: boolean; // When true, WebP files are inserted as-is without re-compression
    excludedFolders: string[];
    editorImageDisplayWidth: number; // 0 = no width suffix on inserted links
}

export const DEFAULT_SETTINGS: PluginSettings = {
    maxDimension: 2000,
    quality: 0.9,
    skipSmallFiles: true,
    skipThresholdKB: 200,
    addTimestamp: true,
    enableMultipleUploads: true,
    skipWebpCompression: false, // When enabled, WebP files are inserted as-is
    excludedFolders: [],
    editorImageDisplayWidth: 0,
};

export interface ICompressImagePlugin extends Plugin {
    settings: PluginSettings;
    saveSettings(): Promise<void>;
}

/** Version of the public API surface. Bump on a backwards-incompatible change. */
export const COMPRESS_IMAGE_API_VERSION = 1;

/** Result of {@link CompressImageApi.saveImage}. */
export interface CompressImageSaveResult {
    /** The file that was created (possibly converted to WebP). */
    file: TFile;
    /** Obsidian embed link for the created file, e.g. `![[image.webp]]`. */
    link: string;
}

/**
 * Public API exposed to other plugins as
 * `app.plugins.plugins['compress-image-webp'].api`.
 *
 * Lets callers save an image through the same pipeline used for paste/drop
 * (attachment path, excluded folders, skip-small, animated-GIF safety, WebP
 * conversion, timestamped names) and get back the created file and its link.
 */
export interface CompressImageApi {
    /** Version of this API surface. */
    readonly version: number;
    /** Whether a browser File is a compressible/acceptable image. */
    isImageFile(file: File): boolean;
    /**
     * Save one image. `source` decides the attachment location (a note to
     * attach next to, or a folder); it defaults to the vault root.
     */
    saveImage(
        file: File,
        source?: TFile | TFolder
    ): Promise<CompressImageSaveResult>;
}

// getAvailablePathForAttachments exists at runtime but is not (yet) part of the
// official typings. Declare it so we can call it without `any` casts.
declare module "obsidian" {
    interface Vault {
        getAvailablePathForAttachments(
            filename: string,
            extension: string,
            source: TFile | TFolder
        ): Promise<string>;
    }
}
