import { InteractiveSegmenter, ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';

let segmenterInstance: InteractiveSegmenter | null = null;
let imageSegmenterInstance: ImageSegmenter | null = null;

export async function initSegmenter() {
    if (segmenterInstance) return segmenterInstance;
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        segmenterInstance = await InteractiveSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite",
                delegate: "GPU"
            },
            outputCategoryMask: true,
            outputConfidenceMasks: false
        });
        return segmenterInstance;
    } catch (e) {
        console.error("Error init segmenter", e);
        throw e;
    }
}

export async function initImageSegmenter() {
    if (imageSegmenterInstance) return imageSegmenterInstance;
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        imageSegmenterInstance = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
                delegate: "GPU"
            },
            outputCategoryMask: true,
            outputConfidenceMasks: false
        });
        return imageSegmenterInstance;
    } catch (e) {
        console.error("Error init image segmenter", e);
        throw e;
    }
}

export async function getSmartMask(
    base64DataUrl: string,
    x: number,
    y: number,
    width: number,
    height: number
): Promise<string> {
    const segmenter = await initSegmenter();

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            // Normalized coordinates for MediaPipe
            const normX = x / width;
            const normY = y / height;

            const result = segmenter.segment(img, {
                keypoint: { x: normX, y: normY }
            });

            const mask = result.categoryMask;
            if (!mask) {
                reject(new Error("Mask generation failed: no category mask"));
                return;
            }

            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("No 2d context"));

            const imgData = ctx.createImageData(canvas.width, canvas.height);
            const data = imgData.data;

            const maskU8 = mask.getAsUint8Array();
            for (let i = 0; i < maskU8.length; i++) {
                const isObject = maskU8[i] > 0;
                const idx = i * 4;
                // Set object to white pixels
                data[idx] = isObject ? 255 : 0;
                data[idx + 1] = isObject ? 255 : 0;
                data[idx + 2] = isObject ? 255 : 0;
                data[idx + 3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);

            // Create a slightly dilated/blurred version for covering "+ pare pixeli dookoła"
            const blurredCanvas = document.createElement("canvas");
            blurredCanvas.width = canvas.width;
            blurredCanvas.height = canvas.height;
            const bCtx = blurredCanvas.getContext("2d");
            if (!bCtx) return reject(new Error("No 2d context"));

            // Draw filled slightly larger
            bCtx.filter = 'blur(15px)';
            bCtx.drawImage(canvas, 0, 0);

            // Optional: apply contrast to harden the blurred edges if we want a solid expanded mask
            // However, a soft expanded mask is actually great for inpainting blending.
            // We will threshold the blur to make it solid mask, but slightly soft at the very edge.
            const bImgData = bCtx.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < bImgData.data.length; i += 4) {
                // if the blurred value is > 30, push it up to 255.
                if (bImgData.data[i] > 20) {
                    bImgData.data[i] = 255;
                    bImgData.data[i + 1] = 255;
                    bImgData.data[i + 2] = 255;
                } else {
                    bImgData.data[i] = 0;
                    bImgData.data[i + 1] = 0;
                    bImgData.data[i + 2] = 0;
                }
                bImgData.data[i + 3] = 255;
            }
            bCtx.putImageData(bImgData, 0, 0);
            // One final small blur for soft edges
            const finalCanvas = document.createElement("canvas");
            finalCanvas.width = canvas.width;
            finalCanvas.height = canvas.height;
            const fCtx = finalCanvas.getContext("2d")!;
            fCtx.filter = 'blur(5px)';
            fCtx.drawImage(blurredCanvas, 0, 0);

            resolve(finalCanvas.toDataURL("image/png"));
        };
        img.onerror = (e) => reject(e);
        img.src = base64DataUrl;
    });
}
export async function getAutomatedSubjectMask(
    base64DataUrl: string
): Promise<string> {
    const segmenter = await initImageSegmenter();

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const result = segmenter.segment(img);
            const mask = result.categoryMask;
            if (!mask) return reject(new Error("Automated mask failed: no category mask"));

            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d")!;
            const imgData = ctx.createImageData(canvas.width, canvas.height);
            const data = imgData.data;

            const maskU8 = mask.getAsUint8Array();
            for (let i = 0; i < maskU8.length; i++) {
                // In selfie_segmenter, person is usually > 0
                const isObject = maskU8[i] > 0;
                const idx = i * 4;
                data[idx] = isObject ? 255 : 0;
                data[idx + 1] = isObject ? 255 : 0;
                data[idx + 2] = isObject ? 255 : 0;
                data[idx + 3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);

            // EXPANDED MASK LOGIC (Lovart High-Fidelity)
            // 1. First blur to expand the mask significantly
            const expandedCanvas = document.createElement("canvas");
            expandedCanvas.width = canvas.width;
            expandedCanvas.height = canvas.height;
            const eCtx = expandedCanvas.getContext("2d")!;
            eCtx.filter = 'blur(25px)'; // Large blur for significant dilation
            eCtx.drawImage(canvas, 0, 0);

            // 2. Threshold the blur to make it a solid expanded mask
            const eImgData = eCtx.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < eImgData.data.length; i += 4) {
                // Low threshold (10) means even faint blur becomes part of the mask = dilation
                if (eImgData.data[i] > 10) {
                    eImgData.data[i] = 255;
                    eImgData.data[i + 1] = 255;
                    eImgData.data[i + 2] = 255;
                } else {
                    eImgData.data[i] = 0;
                    eImgData.data[i + 1] = 0;
                    eImgData.data[i + 2] = 0;
                }
                eImgData.data[i + 3] = 255;
            }
            eCtx.putImageData(eImgData, 0, 0);

            // 3. Final soft edge blur to allow smooth AI blending
            const finalCanvas = document.createElement("canvas");
            finalCanvas.width = canvas.width;
            finalCanvas.height = canvas.height;
            const fCtx = finalCanvas.getContext("2d")!;
            fCtx.filter = 'blur(10px)'; // Soft edge for blending
            fCtx.drawImage(expandedCanvas, 0, 0);

            resolve(finalCanvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = base64DataUrl;
    });
}
