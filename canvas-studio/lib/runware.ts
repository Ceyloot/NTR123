import { v4 as uuidv4 } from 'uuid';

import { STUDIO_PROMPT_TEMPLATE } from './prompts/studio';
import { EDIT_PROMPT_TEMPLATE } from './prompts/edit';
import { INPAINT_PROMPT_TEMPLATE } from './prompts/inpaint';
import { IDENTITY_TRANSFER_TEMPLATE } from './prompts/swap';
import { REMOVE_BG_PROMPT_TEMPLATE } from './prompts/removeBg';
import { MOCKUP_PROMPT_TEMPLATE } from './prompts/mockup';
import { TEXT_AI_PROMPT_TEMPLATE } from './prompts/text-ai';
import { CHARACTER_FUSION_TEMPLATE } from './prompts/fusion';

const RUNWARE_API_URL = 'https://api.runware.ai/v1';
const MODEL_ID = 'runware:100@1'; // Default high-quality Flux Dev model for standard tasks
const MODEL_UPSCALE = 'runware:4@1';
const MODEL_REMOVE_BG = 'runware:110@1';
const MODEL_FLUX = 'runware:100@1';
const MODEL_SDXL = 'runware:1@1';
export const MODEL_BFL = 'bfl:4@1'; // Reserved ONLY for high-precision text editing

// Strip data URL prefix if present
export function stripDataUrl(dataUrl: string): string {
    if (dataUrl.startsWith('data:')) {
        const [, data] = dataUrl.split(',');
        return data; // Runware often accepts raw base64 or complete data URIs for images, but raw base64 is safer for 'imageBase64' fields? Actually, data URL might be safer.
    }
    return dataUrl;
}

/**
 * Composites the AI result back into the original image using the mask.
 * This ensures the background outside the mask is 100% preserved.
 */
export async function compositeResult(originalBase64: string, resultBase64: string, maskBase64: string, width: number, height: number): Promise<string> {
    return new Promise((resolve) => {
        const original = new Image();
        const result = new Image();
        const mask = new Image();
        let loaded = 0;
        
        const process = () => {
            loaded++;
            if (loaded < 3) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            
            // 1. Draw original background
            ctx.drawImage(original, 0, 0, width, height);
            
            // 2. Prepare result on a temp canvas to use globalCompositeOperation
            const resCanvas = document.createElement('canvas');
            resCanvas.width = width;
            resCanvas.height = height;
            const resCtx = resCanvas.getContext('2d')!;
            resCtx.drawImage(result, 0, 0, width, height);
            
            // 3. Draw mask to temp canvas (to handle Alpha/Feathering)
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const mCtx = maskCanvas.getContext('2d')!;
            mCtx.drawImage(mask, 0, 0, width, height);
            
            const finalImgData = ctx.getImageData(0, 0, width, height);
            const resImgData = resCtx.getImageData(0, 0, width, height);
            const maskImgData = mCtx.getImageData(0, 0, width, height);
            
            for (let i = 0; i < finalImgData.data.length; i += 4) {
                const alpha = maskImgData.data[i] / 255; // Use Red channel as mask intensity
                if (alpha > 0) {
                    // Weighted average (alpha blending)
                    finalImgData.data[i] = (resImgData.data[i] * alpha) + (finalImgData.data[i] * (1 - alpha));
                    finalImgData.data[i+1] = (resImgData.data[i+1] * alpha) + (finalImgData.data[i+1] * (1 - alpha));
                    finalImgData.data[i+2] = (resImgData.data[i+2] * alpha) + (finalImgData.data[i+2] * (1 - alpha));
                }
            }
            
            ctx.putImageData(finalImgData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        
        original.onload = process;
        result.onload = process;
        mask.onload = process;
        
        original.src = ensureBase64(originalBase64).startsWith('data:') ? originalBase64 : `data:image/jpeg;base64,${originalBase64}`;
        result.src = ensureBase64(resultBase64).startsWith('data:') ? resultBase64 : `data:image/jpeg;base64,${resultBase64}`;
        mask.src = ensureBase64(maskBase64).startsWith('data:') ? maskBase64 : `data:image/png;base64,${maskBase64}`;
    });
}

// Ensure the image string is raw base64
export function ensureBase64(dataUrlOrBase64: string): string {
    if (dataUrlOrBase64.startsWith('data:')) {
        const [, data] = dataUrlOrBase64.split(',');
        return data;
    }
    return dataUrlOrBase64;
}

/**
 * Applies a mask to an image by filling the masked area (white) with noise or black.
 * This is used for "Pixel Dissolution" to create a void for the AI to fill.
 */
export async function applyMaskToImage(imageBase64: string, maskBase64: string, width: number, height: number, fillType: 'black' | 'noise' = 'black'): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        const mask = new Image();
        let loaded = 0;
        
        const process = () => {
            loaded++;
            if (loaded < 2) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            
            // 1. Draw original image
            ctx.drawImage(img, 0, 0, width, height);
            
            // 2. Prepare to punch out the mask
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const mCtx = maskCanvas.getContext('2d')!;
            mCtx.drawImage(mask, 0, 0, width, height);
            
            const imgData = ctx.getImageData(0, 0, width, height);
            const maskData = mCtx.getImageData(0, 0, width, height);
            
            for (let i = 0; i < imgData.data.length; i += 4) {
                const maskValue = maskData.data[i]; // Use Red channel as intensity
                if (maskValue > 50) { // If masked (white/gray)
                    if (fillType === 'black') {
                        imgData.data[i] = 0;
                        imgData.data[i+1] = 0;
                        imgData.data[i+2] = 0;
                    } else {
                        // Noise
                        imgData.data[i] = Math.random() * 255;
                        imgData.data[i+1] = Math.random() * 255;
                        imgData.data[i+2] = Math.random() * 255;
                    }
                }
            }
            
            ctx.putImageData(imgData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        
        img.onerror = () => resolve(imageBase64);
        mask.onerror = () => resolve(imageBase64);
        img.src = ensureBase64(imageBase64).startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        mask.src = ensureBase64(maskBase64).startsWith('data:') ? maskBase64 : `data:image/png;base64,${maskBase64}`;
    });
}

const SUPPORTED_RESOLUTIONS = [
    { w: 1024, h: 1024, ratio: 1 / 1 },
    { w: 1264, h: 848, ratio: 1264 / 848 },   // 3:2
    { w: 848, h: 1264, ratio: 848 / 1264 },   // 2:3
    { w: 1200, h: 896, ratio: 1200 / 896 },   // 4:3
    { w: 896, h: 1200, ratio: 896 / 1200 },   // 3:4
    { w: 1152, h: 928, ratio: 1152 / 928 },   // 5:4
    { w: 928, h: 1152, ratio: 928 / 1152 },   // 4:5
    { w: 1376, h: 768, ratio: 1376 / 768 },   // 16:9
    { w: 768, h: 1376, ratio: 768 / 1376 },   // 9:16
    { w: 1584, h: 672, ratio: 1584 / 672 },   // 21:9
];

export function snapToSupportedDimensions(width: number, height: number) {
    const inputRatio = width / height;
    let closest = SUPPORTED_RESOLUTIONS[0];
    let minDiff = Math.abs(inputRatio - closest.ratio);

    for (const res of SUPPORTED_RESOLUTIONS) {
        const diff = Math.abs(inputRatio - res.ratio);
        if (diff < minDiff) {
            minDiff = diff;
            closest = res;
        }
    }
    return { width: closest.w, height: closest.h };
}

/**
 * Generates a mask that preserves the center of the image.
 * Black (0) = Preserve original design
 * White (1) = Generate new scene/frame
 */
export function generateFramingMask(width: number, height: number, paddingPercent: number = 0.8): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Fill with white (area to generate)
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Fill center with black (area to preserve)
    const paddingX = (width * (1 - paddingPercent)) / 2;
    const paddingY = (height * (1 - paddingPercent)) / 2;
    const innerW = width * paddingPercent;
    const innerH = height * paddingPercent;

    ctx.fillStyle = 'black';
    ctx.fillRect(paddingX, paddingY, innerW, innerH);

    return canvas.toDataURL('image/png');
}

/**
 * Prepares seed and mask images for seamless outpainting.
 * Centers the source image on a target canvas and creates a soft mask.
 */
export async function prepareOutpaintImages(
    srcBase64: string,
    targetW: number,
    targetH: number
): Promise<{ seed: string; mask: string }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d')!;

            // 1. Fill with neutral background for inpainting context (Runware likes it)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, targetW, targetH);

            // 2. Center the image
            const aspect = img.width / img.height;
            const targetAspect = targetW / targetH;
            let drawW, drawH;
            if (aspect > targetAspect) {
                drawW = targetW;
                drawH = targetW / aspect;
            } else {
                drawH = targetH;
                drawW = targetH * aspect;
            }
            const x = (targetW - drawW) / 2;
            const y = (targetH - drawH) / 2;
            ctx.drawImage(img, x, y, drawW, drawH);

            const seed = canvas.toDataURL('image/jpeg', 0.9);

            // 3. Create the mask
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = targetW;
            maskCanvas.height = targetH;
            const mCtx = maskCanvas.getContext('2d')!;

            // Fill all with white (generate/change)
            mCtx.fillStyle = 'white';
            mCtx.fillRect(0, 0, targetW, targetH);

            // Draw BLACK area (preserve)
            // Use shadow for soft blending around the DESIGN, 
            // but ensure the DESIGN ITSELF is pure black in the mask.
            const inset = 2; // Very small inset to ensure we overlap slightly with original pixels
            mCtx.fillStyle = 'black';
            mCtx.fillRect(x + inset, y + inset, drawW - inset * 2, drawH - inset * 2);

            // Add a soft edge to the mask for better blending
            const blurCanvas = document.createElement('canvas');
            blurCanvas.width = targetW;
            blurCanvas.height = targetH;
            const bCtx = blurCanvas.getContext('2d')!;
            bCtx.filter = 'blur(10px)';
            bCtx.drawImage(maskCanvas, 0, 0);

            const mask = blurCanvas.toDataURL('image/png');
            resolve({ seed, mask });
        };
        img.onerror = reject;
        img.src = srcBase64;
    });
}

async function runwareRequest(apiKey: string, task: any, width: number = 1024, height: number = 1024): Promise<string> {
    const { width: snappedW, height: snappedH } = snapToSupportedDimensions(width, height);

    let lastError: Error | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Generate request body inside the loop to ensure fresh taskUUIDs on each retry
        const requestBody = [
            {
                taskType: 'authentication',
                apiKey,
            },
            {
                taskType: 'imageInference',
                taskUUID: uuidv4(),
                numberResults: 1,
                outputType: ['URL'],
                outputFormat: 'JPEG',
                ...task,
                model: (task.model && task.model !== 'MODEL_ID') ? task.model : MODEL_ID,
                width: snappedW,
                height: snappedH,
            },
        ];

        try {
            const response = await fetch(RUNWARE_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                // If it's a 504 (Timeout) or 502 (Bad Gateway), retry
                if ((response.status === 504 || response.status === 502) && attempt < maxRetries) {
                    console.warn(`Runware received ${response.status}. Retrying attempt ${attempt + 1}...`);
                    // Small delay before retry
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                const errText = await response.text();
                throw new Error(`Runware API error (${response.status}): ${errText}`);
            }

            const data = await response.json();

            if (data.errors && data.errors.length > 0) {
                // If it's a transient task error (like failedTaskTimeout), retry
                const isTransient = data.errors.some((e: any) =>
                    e.message?.includes('timeout') || e.code?.includes('timeout')
                );

                if (isTransient && attempt < maxRetries) {
                    console.warn(`Runware task timeout. Retrying attempt ${attempt + 1}...`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw new Error(`Runware error: ${data.errors[0].message}`);
            }

            if (!Array.isArray(data.data) || data.data.length === 0) {
                throw new Error(`Runware: No data returned.`);
            }

            for (const item of data.data) {
                if (item.taskType === 'imageInference' && item.imageURL) {
                    return item.imageURL;
                }
                if (item.error) {
                    throw new Error(`Runware inference error: ${item.errorMessage || item.error}`);
                }
            }
        } catch (err: any) {
            lastError = err;
            if (attempt === maxRetries) throw err;
        }
    }

    throw lastError || new Error(`Runware: Image URL not found in response.`);
}

export async function runwareGenerateImage(apiKey: string, prompt: string): Promise<string> {
    return runwareRequest(apiKey, {
        positivePrompt: STUDIO_PROMPT_TEMPLATE(prompt),
    });
}

export async function runwareStudioGenerate(
    apiKey: string,
    prompt: string,
    model: string,
    width: number,
    height: number,
    referenceImage?: string, // For Img2Img
    upscaleFactor?: number // New optional parameter
): Promise<string> {
    const { width: snappedW, height: snappedH } = snapToSupportedDimensions(width, height);

    const inferenceTaskId = uuidv4();
    const inferenceTask: any = {
        taskType: 'imageInference',
        taskUUID: inferenceTaskId,
        model: model,
        width: snappedW,
        height: snappedH,
        positivePrompt: prompt,
        numberResults: 1,
        outputType: ['URL'],
        outputFormat: 'JPEG',
    };

    if (referenceImage) {
        inferenceTask.referenceImages = [ensureBase64(referenceImage)];
    }

    const requestBody: any[] = [
        {
            taskType: 'authentication',
            apiKey,
        },
        inferenceTask,
    ];

    // If upscale is requested, add it to the chain
    if (upscaleFactor && upscaleFactor > 1) {
        requestBody.push({
            taskType: 'upscale',
            taskUUID: uuidv4(),
            inputImage: `@${inferenceTaskId}`, // Reference the first task
            upscaleFactor: upscaleFactor,
            outputType: ['URL'],
            outputFormat: 'JPEG',
        });
    }

    const response = await fetch('https://api.runware.ai/v1', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Runware API error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
        throw new Error(`Runware error: ${data.errors[0].message}`);
    }

    if (!Array.isArray(data.data) || data.data.length === 0) {
        throw new Error(`Runware: No data returned.`);
    }

    // Return the result of the LAST relevant task (upscale if present, otherwise inference)
    const targetTaskType = upscaleFactor ? 'upscale' : 'imageInference';

    for (const item of data.data) {
        if (item.taskType === targetTaskType && (item.imageURL || item.url)) {
            return item.imageURL || item.url;
        }
        if (item.error) {
            throw new Error(`Runware ${targetTaskType} error: ${item.errorMessage || item.error}`);
        }
    }

    // Fallback search if not found in order
    const lastItem = data.data[data.data.length - 1];
    if (lastItem?.imageURL || lastItem?.url) return lastItem.imageURL || lastItem.url;

    throw new Error(`Runware: Final image URL not found in response.`);
}

export async function runwareEditImage(
    apiKey: string,
    imageBase64: string,
    prompt: string,
    width: number = 1024,
    height: number = 1024,
    model?: string
): Promise<string> {
    return runwareRequest(apiKey, {
        positivePrompt: EDIT_PROMPT_TEMPLATE(prompt),
        inputImage: ensureBase64(imageBase64),
        model: model || MODEL_ID
    }, width, height);
}

export async function runwareInpaint(
    apiKey: string,
    imageBase64: string,
    maskBase64: string,
    prompt: string,
    width: number = 1024,
    height: number = 1024,
    model?: string
): Promise<string> {
    return runwareRequest(apiKey, {
        positivePrompt: INPAINT_PROMPT_TEMPLATE(prompt),
        inputImage: ensureBase64(imageBase64),
        maskImage: ensureBase64(maskBase64),
        model: model || MODEL_ID
    }, width, height);
}

export async function runwareVisualInpaint(
    apiKey: string,
    visualPromptBase64: string,
    prompt: string,
    width: number = 1024,
    height: number = 1024
): Promise<string> {
    const masterPrompt = `[VISUAL INPAINTING TASK]
TASK: ${prompt}

Replace the MAGENTA shape ENTIRELY with the requested object seamlessly.
The new element MUST perfectly match the surrounding lighting, shadows, reflections, and color temperature. 
Do not leave any magenta pixels or neon outlines visible.
Blend the generated object into the existing environment naturally without looking like a simple pasted sticker. Match the film grain and depth of field.`;

    return runwareRequest(apiKey, {
        positivePrompt: masterPrompt,
        referenceImages: [ensureBase64(visualPromptBase64)],
        model: MODEL_ID
    }, width, height);
}

export async function runwareCharacterSwap(
    apiKey: string,
    sourceImageBase64: string,
    targetImageBase64: string,
    maskBase64: string,
    sourceDescription: string,
    targetDescription: string,
    prompt: string,
    variant: 'local' | 'full-body' = 'local',
    width?: number,
    height?: number,
    identityDescription: string = "",
    model?: string
): Promise<{ imageUrl: string; text: string }> {
    const isGoogleModel = model?.startsWith('google:');
    let finalTargetBase64 = targetImageBase64;
    
    if (isGoogleModel) {
        console.log("Preparing Character Swap for Google Model (Pixel Dissolution)...");
        finalTargetBase64 = await applyMaskToImage(targetImageBase64, maskBase64, width || 1024, height || 1024, 'black');
    }

    const imageUrl = await runwareRequest(apiKey, {
        positivePrompt: IDENTITY_TRANSFER_TEMPLATE(prompt, variant, identityDescription),
        // Google Model 4-Image Standard for Pose Preservation:
        // Image 1 = Identity Blueprint (Source)
        // Image 2 = Pose & Mimicry Reference (Target Original)
        // Image 3 = Void to fill (Target Masked)
        // Image 4 = Mask
        referenceImages: isGoogleModel ? [
            ensureBase64(sourceImageBase64),
            ensureBase64(targetImageBase64),
            ensureBase64(finalTargetBase64), 
            ensureBase64(maskBase64)
        ] : [
            ensureBase64(sourceImageBase64),
            ensureBase64(finalTargetBase64), 
            ensureBase64(maskBase64)
        ],
        model: model || MODEL_ID
    }, width || 1024, height || 1024);

    return { imageUrl, text: "Character identity and style transferred successfully." };
}

export async function runwareCharacterFusion(
    apiKey: string,
    sourceImageBase64: string,
    targetImageBase64: string,
    maskBase64: string,
    prompt: string = "",
    variant: 'local' | 'full-body' = 'local',
    width: number = 1024,
    height: number = 1024,
    identityDescription: string = ""
): Promise<{ imageUrl: string }> {
    const imageUrl = await runwareRequest(apiKey, {
        positivePrompt: CHARACTER_FUSION_TEMPLATE(prompt, variant, identityDescription),
        // Image 1 = Source, Image 2 = Target, Image 3 = Mask
        referenceImages: [ensureBase64(sourceImageBase64), ensureBase64(targetImageBase64), ensureBase64(maskBase64)],
        model: MODEL_ID
    }, width, height);

    return { imageUrl };
}

export async function runwareRemoveBackground(
    apiKey: string,
    imageBase64: string
): Promise<string> {
    const requestBody = [
        {
            taskType: 'authentication',
            apiKey,
        },
        {
            taskType: 'imageBackgroundRemoval',
            taskUUID: uuidv4(),
            inputImage: ensureBase64(imageBase64),
            outputType: ['URL'],
            outputFormat: 'PNG', 
            model: MODEL_REMOVE_BG,
            rgba: [0, 0, 0, 0],
        },
    ];

    const response = await fetch(RUNWARE_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Runware API error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
        throw new Error(`Runware error: ${data.errors[0].message}`);
    }

    if (!Array.isArray(data.data) || data.data.length === 0) {
        throw new Error(`Runware: No data returned.`);
    }

    for (const item of data.data) {
        if (item.taskType === 'imageBackgroundRemoval' && item.imageURL) {
            return item.imageURL;
        }
        if (item.error) {
            throw new Error(`Runware removal error: ${item.errorMessage || item.error}`);
        }
    }

    throw new Error(`Runware: Background removed image URL not found.`);
}

export async function runwareUpscale(
    apiKey: string,
    imageBase64: string,
    upscaleFactor: number = 4
): Promise<string> {
    const requestBody = [
        {
            taskType: 'authentication',
            apiKey,
        },
        {
            taskType: 'upscale',
            taskUUID: uuidv4(),
            inputImage: ensureBase64(imageBase64),
            upscaleFactor: upscaleFactor,
            outputType: ['URL'],
            outputFormat: 'JPEG',
            model: MODEL_UPSCALE,
        },
    ];

    const response = await fetch(RUNWARE_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Runware API error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
        throw new Error(`Runware error: ${data.errors[0].message}`);
    }

    if (!Array.isArray(data.data) || data.data.length === 0) {
        throw new Error(`Runware: No data returned.`);
    }

    for (const item of data.data) {
        if (item.taskType === 'upscale' && (item.imageURL || item.url)) {
            return item.imageURL || item.url;
        }
        if (item.error) {
            throw new Error(`Runware upscale error: ${item.errorMessage || item.error}`);
        }
    }

    throw new Error(`Runware: Upscaled image URL not found. Response: ${JSON.stringify(data.data)}`);
}

export async function runwareMockup(
    apiKey: string,
    imageBase64: string,
    maskBase64: string,
    sceneDescription: string,
    width: number = 1024,
    height: number = 1024
): Promise<string> {
    // Switching back to Flux.1 (MODEL_FLUX) because SDXL failed to load for this task.
    // Flux.1 is excellent at following prompts and preserving context.
    return runwareRequest(apiKey, {
        positivePrompt: MOCKUP_PROMPT_TEMPLATE(sceneDescription),
        // Image 1 = Background, Image 2 = Mask
        referenceImages: [ensureBase64(imageBase64), ensureBase64(maskBase64)],
        model: MODEL_ID
    }, width, height);
}

export async function runwareGenerateText(
    apiKey: string,
    text: string,
    style: string,
    width: number = 1024,
    height: number = 1024,
    referenceImage?: string
): Promise<string> {
    return runwareRequest(apiKey, {
        positivePrompt: TEXT_AI_PROMPT_TEMPLATE(text, style),
        inputImage: referenceImage ? ensureBase64(referenceImage) : undefined,
        strength: referenceImage ? 0.3 : undefined, // Low strength to preserve background
        model: MODEL_ID,
    }, width, height);
}

export async function runwareImageInference(
    apiKey: string,
    prompt: string,
    inputImage?: string,
    strength: number = 0.5,
    width: number = 1024,
    height: number = 1024,
    model?: string
): Promise<string> {
    return runwareRequest(apiKey, {
        positivePrompt: prompt,
        inputImage: inputImage ? ensureBase64(inputImage) : undefined,
        strength: inputImage ? strength : undefined,
        model: model,
    }, width, height);
}

export async function runwareChat(
    apiKey: string,
    prompt: string,
    imageBase64?: string
): Promise<string> {
    // Runware API is for image generation, not generic LLM chat. 
    // Fallback to image generation if chat occurs or provide a message.
    return "This functionality is now managed by Runware (Image AI). Chat intent was interpreted as image prompt. Image result generated separately if requested.";
}
