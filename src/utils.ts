import { Plugin, Editor, MarkdownView, Notice, TFile, TFolder } from "obsidian";
import { PluginSettings } from "./types";
import { compressToWebP, isAnimatedGif } from "./compress";
import { getOriginalExtension, shouldPreserveOriginalAtPath } from "./exclusions";

export function getHumanReadableTimestamp() {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = (now.getMonth() + 1).toString().padStart(2, "0");
    const DD = now.getDate().toString().padStart(2, "0");
    const HH = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    const ss = now.getSeconds().toString().padStart(2, "0");
    return `${YYYY}_${MM}_${DD}_${HH}_${mm}_${ss}`;
}

/**
 * Image detection that does not rely solely on MIME type: files dragged from
 * some sources (e.g. certain Windows folders) arrive with an empty file.type.
 * SVG is excluded because rasterizing it to WebP is never desirable.
 */
export function isImageFile(file: File): boolean {
    if (file.type === "image/svg+xml") return false;
    if (file.type.startsWith("image/")) return true;
    return /\.(png|jpe?g|bmp|gif|webp|avif|heic|heif)$/i.test(file.name);
}

/**
 * Shared save path for paste, editor drop, File Explorer drop, and multiple
 * upload. Resolves the attachment path, decides whether to preserve the
 * original bytes (excluded folder, skip-WebP setting, or animated GIF),
 * compresses otherwise, and writes the file to the vault.
 */
export async function saveImageFile(
    plugin: Plugin,
    settings: PluginSettings,
    file: File,
    source: TFile | TFolder
): Promise<TFile> {
    const originalExtension = getOriginalExtension(file);
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf(".")) || "pasted_image";

    let finalName = nameWithoutExt;
    if (settings.addTimestamp) {
        finalName += `_${getHumanReadableTimestamp()}`;
    }

    // File Explorer drops pass a TFolder: save directly into that folder to
    // honor the visual drop location and to avoid the vault attachment API's
    // getParentPrefix crash when the source is the vault root (parent === null).
    if (source instanceof TFolder) {
        return await saveImageFileToFolder(plugin, settings, file, finalName, originalExtension, source);
    }

    // Editor paste / drop: source is a TFile (the active note). Resolve via
    // the vault attachment API but fall back to the public fileManager API
    // when the vault helper throws (e.g. source at vault root where
    // parent.getParentPrefix() would be called on null).
    const originalAttachmentPath = await getAvailablePathForAttachmentsSafe(plugin, finalName, originalExtension, source);

    const preserveOriginal = shouldPreserveOriginalAtPath(originalAttachmentPath, settings);
    const skipEfficient = settings.skipWebpCompression
        && (new Set(["webp", "avif", "heic", "heif"]).has(originalExtension) || ["image/webp", "image/avif", "image/heic", "image/heif"].includes(file.type));
    const animatedGif = originalExtension === "gif" && (await isAnimatedGif(file));
    const isSmallFile = settings.skipSmallFiles && file.size < settings.skipThresholdKB * 1024;
    const useOriginalFile = preserveOriginal || skipEfficient || animatedGif || isSmallFile;

    let attachmentPath = originalAttachmentPath;
    let arrayBuffer: ArrayBuffer;
    if (useOriginalFile) {
        arrayBuffer = await file.arrayBuffer();
    } else {
        arrayBuffer = await compressToWebP(file, settings);
        attachmentPath = await getAvailablePathForAttachmentsSafe(plugin, finalName, "webp", source);
    }

    return await plugin.app.vault.createBinary(attachmentPath, arrayBuffer);
}

async function saveImageFileToFolder(
    plugin: Plugin,
    settings: PluginSettings,
    file: File,
    finalName: string,
    originalExtension: string,
    folder: TFolder
): Promise<TFile> {
    // Use a tentative path inside the target folder for the exclusion check.
    const tentativeOriginalPath = folder.isRoot() ? `${finalName}.${originalExtension}` : `${folder.path}/${finalName}.${originalExtension}`;

    const preserveOriginal = shouldPreserveOriginalAtPath(tentativeOriginalPath, settings);
    const skipEfficient = settings.skipWebpCompression
        && (new Set(["webp", "avif", "heic", "heif"]).has(originalExtension) || ["image/webp", "image/avif", "image/heic", "image/heif"].includes(file.type));
    const animatedGif = originalExtension === "gif" && (await isAnimatedGif(file));
    const isSmallFile = settings.skipSmallFiles && file.size < settings.skipThresholdKB * 1024;
    const useOriginalFile = preserveOriginal || skipEfficient || animatedGif || isSmallFile;

    const targetExt = useOriginalFile ? originalExtension : "webp";
    const arrayBuffer = useOriginalFile ? await file.arrayBuffer() : await compressToWebP(file, settings);

    const attachmentPath = await getUniquePathInFolder(plugin, folder, finalName, targetExt);

    return await plugin.app.vault.createBinary(attachmentPath, arrayBuffer);
}

async function getAvailablePathForAttachmentsSafe(
    plugin: Plugin,
    name: string,
    ext: string,
    source: TFile
): Promise<string> {
    const vaultAny = plugin.app.vault as unknown as {
        getAvailablePathForAttachments: (filename: string, extension: string, src: unknown) => Promise<string>;
    };
    try {
        return await vaultAny.getAvailablePathForAttachments(name, ext, source);
    } catch {
        // Fallback to the public FileManager helper which correctly handles
        // root parent (null) cases via sourcePath string.
        const fallback = (plugin.app.fileManager as unknown as {
            getAvailablePathForAttachment?: (filename: string, sourcePath?: string) => Promise<string>;
        }).getAvailablePathForAttachment;
        if (typeof fallback === "function") {
            return await fallback.call(plugin.app.fileManager, `${name}.${ext}`, source.path);
        }
        // Final fallback: manual dedupe in the source file's folder
        const folder = source.parent ?? plugin.app.vault.getRoot();
        return await getUniquePathInFolder(plugin, folder, name, ext);
    }
}

async function getUniquePathInFolder(
    plugin: Plugin,
    folder: TFolder,
    baseName: string,
    ext: string
): Promise<string> {
    const vaultAny = plugin.app.vault as unknown as {
        getAvailablePath?: (filename: string, extension: string) => Promise<string>;
    };
    if (typeof vaultAny.getAvailablePath === "function") {
        const prefix = folder.isRoot() ? "" : `${folder.path}/`;
        try {
            return await vaultAny.getAvailablePath(prefix + baseName, ext);
        } catch {
            // fall through to manual dedupe
        }
    }
    let candidate = folder.isRoot() ? `${baseName}.${ext}` : `${folder.path}/${baseName}.${ext}`;
    let counter = 1;
    while (plugin.app.vault.getAbstractFileByPath(candidate)) {
        candidate = folder.isRoot() ? `${baseName} ${counter}.${ext}` : `${folder.path}/${baseName} ${counter}.${ext}`;
        counter++;
    }
    return candidate;
}

/**
 * Appends a display width to an embed link without touching the file:
 * wikilinks  ![[path]]      -> ![[path|500]]
 * md links   ![alt](path)   -> ![alt|500](path)
 * Obsidian renders the suffix as a display resize; the original bytes stay full-res.
 */
function applyDisplayWidth(link: string, width: number): string {
    if (!width || width <= 0) return link;
    if (link.endsWith("]]")) {
        return link.slice(0, -2) + `|${width}]]`;
    }
    const altEnd = link.indexOf("](");
    if (altEnd > 0) {
        return link.slice(0, altEnd) + `|${width}` + link.slice(altEnd);
    }
    return link;
}

export async function processAndInsertImages(
    plugin: Plugin,
    settings: PluginSettings,
    files: File[],
    editor: Editor,
    view: MarkdownView
) {
    const links: string[] = [];
    const activeFile = view.file;
    if (!activeFile) return;

    const notice = new Notice(`Processing ${files.length} image(s)...`, 0);

    for (const file of files) {
        try {
            const newFile = await saveImageFile(plugin, settings, file, activeFile);

            // Generate markdown link and ensure it has ! prefix
            const link = plugin.app.fileManager.generateMarkdownLink(newFile, activeFile.path);
            const prefixedLink = applyDisplayWidth(link.startsWith("!") ? link : `!${link}`, settings.editorImageDisplayWidth);
            links.push(prefixedLink);

        } catch (err) {
            console.error(`Failed to compress ${file.name}:`, err);
            new Notice(`Failed to compress ${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
    }

    if (links.length > 0) {
        // Insert with newlines between them
        const contentToInsert = links.join("\n\n") + "\n";
        editor.replaceSelection(contentToInsert);
    }

    notice.hide();
}
