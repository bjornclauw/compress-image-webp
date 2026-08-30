import { Plugin, Editor, MarkdownView, TFile, TFolder, Notice, Workspace, EventRef } from "obsidian";
import { PluginSettings } from "./types";
import { isImageFile, processAndInsertImages, saveImageFile } from "./utils";

// editor-paste and editor-drop are emitted by Obsidian at runtime but are not
// part of the official typings yet, so declare them here to avoid `any` casts.
type EditorEventWorkspace = Workspace & {
    on(name: "editor-paste", callback: (evt: ClipboardEvent, editor: Editor, view: MarkdownView) => void, ctx?: unknown): EventRef;
    on(name: "editor-drop", callback: (evt: DragEvent, editor: Editor, view: MarkdownView) => void, ctx?: unknown): EventRef;
};

export function registerInterceptor(plugin: Plugin, settings: PluginSettings) {
	// Intercept paste and drop events
	plugin.registerEvent(
		(plugin.app.workspace as EditorEventWorkspace).on("editor-paste", (evt: ClipboardEvent, editor: Editor, view: MarkdownView) => {
			if (evt.defaultPrevented) return;

			const items = evt.clipboardData?.items;
			if (!items) return;

			const files: File[] = [];
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item.kind === "file") {
					const file = item.getAsFile();
					if (file && isImageFile(file)) files.push(file);
				}
			}

			if (files.length > 0) {
				evt.preventDefault();
				void processAndInsertImages(plugin, settings, files, editor, view);
			}
		})
	);

	plugin.registerEvent(
		(plugin.app.workspace as EditorEventWorkspace).on("editor-drop", (evt: DragEvent, editor: Editor, view: MarkdownView) => {
			if (evt.defaultPrevented) return;

			const filesList = evt.dataTransfer?.files;
			if (!filesList) return;

			const files: File[] = [];
			for (let i = 0; i < filesList.length; i++) {
				const file = filesList[i];
				if (isImageFile(file)) {
					files.push(file);
				}
			}

			if (files.length > 0) {
				evt.preventDefault();
				void processAndInsertImages(plugin, settings, files, editor, view);
			}
		})
	);

	// Global drop handler using capture phase for File Explorer
	plugin.registerDomEvent(activeDocument, "drop", (evt: DragEvent) => {
		const target = evt.target as HTMLElement;
		const isFileExplorer = target.closest(".nav-files-container") || target.closest(".nav-folder") || target.closest(".nav-file");

		// If it's not file explorer, ignore it and let other handlers (like editor-drop) work
		if (!isFileExplorer) return;

		const filesList = evt.dataTransfer?.files;
		if (!filesList || filesList.length === 0) return;

		const files: File[] = [];
		for (let i = 0; i < filesList.length; i++) {
			const file = filesList[i];
			if (isImageFile(file)) {
				files.push(file);
			}
		}

		if (files.length > 0) {
			evt.preventDefault();
			evt.stopPropagation();
			void processGlobalDrop(plugin, settings, files, target);
		}
	}, true);

	// Also need dragover to allow the drop
	plugin.registerDomEvent(activeDocument, "dragover", (evt: DragEvent) => {
		const target = evt.target as HTMLElement;
		const isFileExplorer = target.closest(".nav-files-container") || target.closest(".nav-folder") || target.closest(".nav-file");

		if (isFileExplorer && evt.dataTransfer?.types.includes("Files")) {
			evt.preventDefault(); // This is needed to allow a drop
		}
	});
}

async function processGlobalDrop(plugin: Plugin, settings: PluginSettings, files: File[], target: HTMLElement) {
	const notice = new Notice(`Processing ${files.length} images for File Explorer...`, 0);

	// Determine destination folder from target. Obsidian's file explorer nests
	// titles and containers, so we look for the closest element carrying a
	// data-path attribute inside the explorer. This correctly resolves drops
	// onto folder titles, file rows, or the folder container itself.
	const navEl = target.closest(".nav-folder, .nav-file") ?? target.closest("[data-path]");
	const targetPath = navEl?.getAttribute("data-path") ?? target.closest("[data-path]")?.getAttribute("data-path");
	let targetFolder: TFolder | null = null;

	if (targetPath) {
		const abstractFile = plugin.app.vault.getAbstractFileByPath(targetPath);
		if (abstractFile instanceof TFile) {
			// TFile.parent is null for files at vault root in some edge cases;
			// fall back to the vault root to avoid passing null into
			// getAvailablePathForAttachments (which would call null.getParentPrefix()).
			targetFolder = abstractFile.parent ?? plugin.app.vault.getRoot();
		} else if (abstractFile instanceof TFolder) {
			// It's a folder
			targetFolder = abstractFile;
		}
	}
	const source: TFolder = targetFolder ?? plugin.app.vault.getRoot();

	for (const file of files) {
		try {
			const newFile = await saveImageFile(plugin, settings, file, source);
			new Notice(`Saved to: ${newFile.path}`);
		} catch (err) {
			console.error("Global drop failed", err);
			new Notice(`Failed to save ${file.name}. Check console for details.`);
		}
	}
	notice.hide();
}
