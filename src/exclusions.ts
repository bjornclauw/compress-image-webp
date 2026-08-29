import { PluginSettings } from "./types";

export function normalizeVaultPath(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
}

export function isPathInExcludedFolder(path: string, excludedFolders: string[] = []): boolean {
    const normalizedPath = normalizeVaultPath(path);

    return excludedFolders.some((folder) => {
        const normalizedFolder = normalizeVaultPath(folder);
        return normalizedFolder.length > 0
            && (normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`));
    });
}

export function shouldPreserveOriginalAtPath(path: string, settings: PluginSettings): boolean {
    return isPathInExcludedFolder(path, settings.excludedFolders);
}

export function getOriginalExtension(file: File): string {
    const dotIndex = file.name.lastIndexOf(".");
    if (dotIndex >= 0 && dotIndex < file.name.length - 1) {
        return file.name.substring(dotIndex + 1).toLowerCase();
    }

    const mimeSubtype = file.type.split("/")[1]?.split("+")[0];
    return mimeSubtype || "image";
}
