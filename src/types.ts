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
    maxDimension: 1600,
    quality: 0.75,
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
