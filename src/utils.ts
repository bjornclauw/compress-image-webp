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

    // Resolve once with the original extension; this both determines the
    // destination folder (for the exclusion check) and is the final path when
    // the original bytes are preserved.
    // Note: getAvailablePathForAttachments expects name without extension if second arg is extension
    const originalAttachmentPath = await plugin.app.vault.getAvailablePathForAttachments(finalName, originalExtension, source);

    const preserveOriginal = shouldPreserveOriginalAtPath(originalAttachmentPath, settings);
    const skipWebpCompression = settings.skipWebpCompression && file.type === "image/webp";
    const animatedGif = originalExtension === "gif" && (await isAnimatedGif(file));
    const useOriginalFile = preserveOriginal || skipWebpCompression || animatedGif;

    let attachmentPath = originalAttachmentPath;
    let arrayBuffer: ArrayBuffer;
    if (useOriginalFile) {
        arrayBuffer = await file.arrayBuffer();
    } else {
        arrayBuffer = await compressToWebP(file, settings);
        attachmentPath = await plugin.app.vault.getAvailablePathForAttachments(finalName, "webp", source);
    }

    return await plugin.app.vault.createBinary(attachmentPath, arrayBuffer);
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
