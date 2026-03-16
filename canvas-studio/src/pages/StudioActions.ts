import { runwareStudioGenerate } from '@/lib/runware';

// Define the model mapping
// According to Runware API, FLUX models use specific identifiers.
// FLUX.1 Schnell: runware:100@1
// FLUX.1 Dev: runware:101@1
const MODEL_MAPPING = {
    'nano-banana-pro': 'google:4@2',
    'turbo': 'runware:100@1',
    'ultra': 'runware:101@1',
};

export async function generatePhotoSelectedModel(
    prompt: string,
    modelKey: 'nano-banana-pro' | 'turbo' | 'ultra',
    aspectRatio: string,
    resolution: string,
    referenceImageBase64?: string
) {
    const apiKey = import.meta.env.VITE_RUNWARE_API_KEY;
    if (!apiKey) {
        throw new Error("Missing VITE_RUNWARE_API_KEY in environment");
    }

    const modelId = MODEL_MAPPING[modelKey] || MODEL_MAPPING['nano-banana-pro'];

    const isGoogleModel = modelId.startsWith('google:');

    // Google Imagen models have strictly allowed dimension pairs
    const EXACT_DIMENSIONS: Record<string, Record<string, { w: number, h: number }>> = {
        '1K': {
            '1:1': { w: 1024, h: 1024 },
            '16:9': { w: 1344, h: 768 },
            '9:16': { w: 768, h: 1344 },
            '4:3': { w: 1216, h: 896 },
            '3:4': { w: 896, h: 1216 },
            '3:2': { w: 1280, h: 832 },
            '2:3': { w: 832, h: 1280 },
        },
        '2K': {
            '1:1': { w: 2048, h: 2048 },
            '16:9': { w: 2688, h: 1536 },
            '9:16': { w: 1536, h: 2688 },
            '4:3': { w: 2432, h: 1792 },
            '3:4': { w: 1792, h: 2432 },
            '3:2': { w: 2560, h: 1664 },
            '2:3': { w: 1664, h: 2560 },
        }
    };

    let finalWidth: number;
    let finalHeight: number;
    let upscaleFactor: number | undefined = undefined;

    const resKey = resolution === '4K' ? '1K' : resolution;
    const exactDims = EXACT_DIMENSIONS[resKey]?.[aspectRatio];

    if (isGoogleModel && exactDims) {
        finalWidth = exactDims.w;
        finalHeight = exactDims.h;
    } else {
        // Runware FLUX models standard resolution calculation
        let baseDim = 1024;
        if (resolution === '2K') {
            baseDim = 1536;
        }

        const [rw, rh] = aspectRatio.split(':').map(Number);
        const ratio = rw / rh;

        if (ratio > 1) {
            finalWidth = baseDim;
            finalHeight = Math.round(baseDim / ratio / 64) * 64;
        } else if (ratio < 1) {
            finalHeight = baseDim;
            finalWidth = Math.round(baseDim * ratio / 64) * 64;
        } else {
            finalWidth = baseDim;
            finalHeight = baseDim;
        }

        // Ensure dimensions are within 512-2048 and multiples of 64
        finalWidth = Math.max(512, Math.min(2048, Math.round(finalWidth / 64) * 64));
        finalHeight = Math.max(512, Math.min(2048, Math.round(finalHeight / 64) * 64));
    }

    if (resolution === '4K') {
        upscaleFactor = 4;
    }

    try {
        const imageUrl = await runwareStudioGenerate(
            apiKey,
            prompt,
            modelId,
            finalWidth,
            finalHeight,
            referenceImageBase64 ? referenceImageBase64 : undefined,
            upscaleFactor
        );
        return { success: true, imageUrl };
    } catch (error: any) {
        console.error("Studio generation failed:", error);
        return { success: false, error: error.message || "Failed to generate image" };
    }
}
