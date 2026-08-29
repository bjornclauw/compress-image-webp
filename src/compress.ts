import { PluginSettings } from "./types";

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D | null } {
    if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        return { canvas, ctx: canvas.getContext("2d") };
    }
    const canvas = activeDocument.body.createEl("canvas");
    canvas.detach();
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext("2d") };
}

/**
 * Detects animated GIFs by counting Graphic Control Extensions (0x21 0xF9).
 * More than one frame marker means the GIF is animated and must not be
 * rasterized to a static WebP.
 */
export async function isAnimatedGif(blob: Blob): Promise<boolean> {
    const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
    let frameCount = 0;
    for (let i = 0; i < head.length - 1; i++) {
        if (head[i] === 0x21 && head[i + 1] === 0xf9) {
            frameCount++;
            if (frameCount > 1) return true;
        }
    }
    return false;
}

/**
 * Compresses an image blob to WebP using the Canvas API.
 * Works in both Desktop and Mobile environments.
 */
export async function compressToWebP(blob: Blob, settings: PluginSettings): Promise<ArrayBuffer> {
    // 1. Create a bitmap from the blob (strips EXIF metadata automatically).
    // Explicit orientation handling so EXIF-rotated images decode upright on all engines.
    const imageBitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });

    const maxDim = Math.max(1, settings.maxDimension);
    const quality = Math.min(1, Math.max(0, settings.quality));

    let width = imageBitmap.width;
    let height = imageBitmap.height;

    // 2. Calculate new dimensions if necessary
    if (width > maxDim || height > maxDim) {
        if (width > height) {
            height = Math.max(1, Math.round((height / width) * maxDim));
            width = maxDim;
        } else {
            width = Math.max(1, Math.round((width / height) * maxDim));
            height = maxDim;
        }
    }

    // 3. Iterative halving: downscaling in steps produces noticeably sharper
    // results than a single large-ratio draw.
    let source: CanvasImageSource = imageBitmap;
    let sw = imageBitmap.width;
    let sh = imageBitmap.height;
    while (sw >= width * 2 && sh >= height * 2) {
        const halfW = Math.max(width, Math.floor(sw / 2));
        const halfH = Math.max(height, Math.floor(sh / 2));
        const step = createCanvas(halfW, halfH);
        if (!step.ctx) {
            throw new Error("Failed to get canvas context");
        }
        step.ctx.imageSmoothingEnabled = true;
        step.ctx.imageSmoothingQuality = "high";
        step.ctx.drawImage(source, 0, 0, sw, sh, 0, 0, halfW, halfH);
        source = step.canvas;
        sw = halfW;
        sh = halfH;
    }

    const { canvas, ctx } = createCanvas(width, height);
    if (!ctx) {
        throw new Error("Failed to get canvas context");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, sw, sh, 0, 0, width, height);

    // 4. Export as WebP
    let webpBlob: Blob | null;
    if (canvas instanceof OffscreenCanvas) {
        webpBlob = await canvas.convertToBlob({ type: "image/webp", quality });
    } else {
        webpBlob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), "image/webp", quality);
        });
    }

    // Clean up
    imageBitmap.close();

    if (!webpBlob) {
        throw new Error("Failed to convert canvas to WebP");
    }

    return await webpBlob.arrayBuffer();
}
