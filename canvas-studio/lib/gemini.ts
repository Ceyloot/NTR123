import { GoogleGenAI, Part, HarmCategory, HarmBlockThreshold } from '@google/genai';

/**
 * Interface for image analysis cache
 */
const analysisCache = new Map<string, string>();

import { STUDIO_GEMINI_INSTRUCTION } from './prompts/studio';
import { EDIT_GEMINI_INSTRUCTION } from './prompts/edit';
import { INPAINT_GEMINI_INSTRUCTION } from './prompts/inpaint';
import { IDENTITY_TRANSFER_GEMINI_INSTRUCTION } from './prompts/swap';
import { CANVAS_GEMINI_INSTRUCTION } from './prompts/canvas';
import { OUTPAINT_GEMINI_INSTRUCTION } from './prompts/outpaint';
import { RELIGHT_GEMINI_INSTRUCTION } from './prompts/relight';
import { REMOVE_BG_GEMINI_INSTRUCTION } from './prompts/remove-bg';

const GEMINI_MAIN_MODEL = 'gemini-2.0-flash-exp';
const GEMINI_VISION_MODEL = 'gemini-2.0-flash-exp';

/**
 * Initializes and returns a Google GenAI client.
 * @param apiKey - The Google API key.
 * @returns GoogleGenAI client instance.
 */
export function getClient(apiKey: string) {
    if (!apiKey) throw new Error("API key is required");
    return new GoogleGenAI({ apiKey });
}

/**
 * Converts a base64 string and mime type into a Part object for Gemini.
 * @param base64 - Base64 encoded data.
 * @param mimeType - Mime type of the data.
 * @returns Part object.
 */
export function imageUrlToBase64Part(base64: string, mimeType = 'image/jpeg'): Part {
    return {
        inlineData: {
            data: base64,
            mimeType,
        },
    };
}

/**
 * Strips the data URL prefix if present in a base64 string.
 * @param dataUrl - Base64 data URL.
 * @returns Object with data and mime type.
 */
export function stripDataUrl(dataUrl: string): { data: string; mimeType: string } {
    if (dataUrl.startsWith('data:')) {
        const [header, data] = dataUrl.split(',');
        const mimeType = header.replace('data:', '').replace(';base64', '');
        return { data, mimeType };
    }
    return { data: dataUrl, mimeType: 'image/jpeg' };
}

/**
 * Resizes an image for Gemini analysis (max 1024px) to avoid timeouts.
 */
export async function resizeImageForGemini(base64: string, maxDim: number = 1024): Promise<{ data: string; mimeType: string }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            const resized = canvas.toDataURL('image/jpeg', 0.85);
            resolve(stripDataUrl(resized));
        };
        img.onerror = () => resolve(stripDataUrl(base64));
        img.src = base64;
    });
}
/**
 * @param apiKey - The Google API key.
 * @param imageBase64 - Original image in base64.
 * @param prompt - The editing prompt.
 * @param aspectRatio - Optional aspect ratio.
 * @param resolution - Optional resolution.
 * @returns Edited image in base64.
 */
export async function geminiEditImage(
    apiKey: string,
    imageBase64: string,
    prompt: string,
    aspectRatio?: string,
    resolution?: string
): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    if (!imageBase64) throw new Error("Image base64 is required");
    if (!prompt) throw new Error("Prompt is required");

    console.log("Starting geminiEditImage:", { prompt: prompt.substring(0, 50) + "...", aspectRatio, resolution });

    try {
        const client = getClient(apiKey);
        const { data, mimeType } = stripDataUrl(imageBase64);

        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        imageUrlToBase64Part(data, mimeType),
                        {
                            text: `TECHNICAL SPECIFICATIONS:
- ASPECT RATIO: ${aspectRatio || 'original'}
- RESOLUTION: ${resolution || '4K'}
- Preserve correct proportions and avoid any stretching or distortion.

TASK: ${prompt}`
                        },
                    ],
                },
            ],
            config: {
                responseModalities: ['TEXT', 'IMAGE'],
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_HARASSMENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                ],
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data && part.inlineData?.mimeType) {
                console.log("geminiEditImage completed successfully.");
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        throw new Error('No image returned from Gemini');
    } catch (error) {
        console.warn("geminiEditImage failed:", error instanceof Error ? error.message : String(error));
        throw new Error(`Edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Performs a character swap, generating a person from one image into another.
 * @param apiKey - The Google API key.
 * @param sourceImageBase64 - Person reference image.
 * @param targetImageBase64 - Target scene image.
 * @param maskBase64 - Mask for the replacement area.
 * @param targetDescription - Description of the target scene.
 * @param traits - Character traits from source.
 * @param prompt - Specific user instructions.
 * @param aspectRatio - Optional aspect ratio.
 * @param resolution - Optional resolution.
 * @returns Object with image URL and descriptive text.
 */
export async function geminiCharacterSwap(
    apiKey: string,
    sourceImageBase64: string,
    targetImageBase64: string,
    maskBase64: string,
    targetDescription: string,
    traits: string,
    prompt: string,
    aspectRatio?: string,
    resolution?: string
): Promise<{ imageUrl: string; text: string }> {
    if (!apiKey) throw new Error("API key is required");
    if (!sourceImageBase64) throw new Error("Source image required");
    if (!targetImageBase64) throw new Error("Target image required");
    if (!maskBase64) throw new Error("Mask image required");

    console.log("Starting geminiCharacterSwap:", { prompt: prompt.substring(0, 50) + "..." });

    const client = getClient(apiKey);
    const { data: sourceData, mimeType: sourceMime } = stripDataUrl(sourceImageBase64);
    const { data: targetData, mimeType: targetMime } = stripDataUrl(targetImageBase64);
    const { data: maskData, mimeType: maskMime } = stripDataUrl(maskBase64);

    const masterPrompt = `
Generate a person who looks like the source identity image (Image 1) in the pose and scene of the target scene image (Image 2).

IDENTITY PROFILE (Source from Image 1):
${traits}

TARGET SCENE CONTEXT:
${targetDescription}

TASK INSTRUCTIONS:
1. Generate a person with the exact appearance, facial structure, hair style, and identifying traits from the Source Identity (Image 1).
2. STRICT REQUIREMENT: Accurately match all fine physical details from the Source Identity (Image 1), including the exact skin tone (especially on hands, arms, neck, and face), tattoos, blemishes, and body characteristics to prevent any visual discrepancies or mismatched skin colors.
3. Place the person in the exact pose, body position, and perspective of the person indicated by the mask in the Target Scene (Image 2).
4. Maintain the same lighting, color temperature, and camera angle as the target scene.
5. Seamlessly integrate the person into the scene with natural shadows, highlights, and proper contact points.
6. Preserve the background and every other detail from the target scene exactly as it is.

USER SPECIFIC INSTRUCTIONS: ${prompt}

TECHNICAL SPECS:
- ASPECT RATIO: ${aspectRatio || 'original'}
- RESOLUTION: ${resolution || '4K'}

Output ONLY the edited image with the person seamlessly integrated.`;

    try {
        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: 'Image 1 (Source Identity):' },
                        imageUrlToBase64Part(sourceData, sourceMime),
                        { text: 'Image 2 (Target Scene):' },
                        imageUrlToBase64Part(targetData, targetMime),
                        { text: 'Target Mask (Area to swap):' },
                        imageUrlToBase64Part(maskData, maskMime),
                        { text: masterPrompt },
                    ],
                },
            ],
            config: {
                responseModalities: ["IMAGE"],
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_HARASSMENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                ],
            },
        });

        let imageUrl = '';
        let textPart = '';

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.text) textPart += part.text + ' ';
            if (part.inlineData?.data && part.inlineData?.mimeType) {
                imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        if (!imageUrl) {
            throw new Error(`Model returned no image. ${textPart}`);
        }

        console.log("geminiCharacterSwap completed successfully.");
        return { imageUrl, text: textPart || 'Character swap completed.' };
    } catch (e: any) {
        console.warn("geminiCharacterSwap failed:", e instanceof Error ? e.message : String(e));
        throw new Error(`Swap failed: ${e.message}`);
    }
}

/**
 * Analyzes an image and returns a detailed description.
 * @param apiKey - The Google API key.
 * @param imageBase64 - Image in base64.
 * @param prompt - Optional prompt to specify what to analyze.
 * @returns Image description text.
 */
export async function geminiAnalyzeImage(
    apiKey: string,
    imageBase64: string,
    prompt?: string
): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    if (!imageBase64) throw new Error("Image base64 is required");

    const analysisPrompt = prompt || 'Describe this image in detail. List all visible elements, objects, people, text, colors, and composition.';
    const cacheKey = `${imageBase64.substring(0, 100)}_${analysisPrompt}`;

    if (analysisCache.has(cacheKey)) {
        console.log("Returning cached analysis.");
        return analysisCache.get(cacheKey)!;
    }

    console.log("Starting geminiAnalyzeImage:", { prompt: analysisPrompt.substring(0, 50) + "..." });

    try {
        const client = getClient(apiKey);
        const { data, mimeType } = stripDataUrl(imageBase64);

        const response = await client.models.generateContent({
            model: GEMINI_VISION_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        imageUrlToBase64Part(data, mimeType),
                        { text: analysisPrompt },
                    ],
                },
            ],
        });

        const result = response.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to analyze image.';
        analysisCache.set(cacheKey, result);
        console.log("geminiAnalyzeImage completed successfully.");
        return result;
    } catch (error) {
        console.warn("geminiAnalyzeImage failed:", error instanceof Error ? error.message : String(error));
        throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Performs inpainting on a specific area defined by a mask.
 * @param apiKey - The Google API key.
 * @param imageBase64 - Original image in base64.
 * @param maskBase64 - Mask for the area to edit.
 * @param prompt - Instructions for the inpainting.
 * @param aspectRatio - Optional aspect ratio.
 * @param resolution - Optional resolution.
 * @returns Inpainted image in base64.
 */
export async function geminiInpaint(
    apiKey: string,
    imageBase64: string,
    maskBase64: string,
    prompt: string,
    aspectRatio?: string,
    resolution?: string
): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    if (!imageBase64) throw new Error("Image base64 is required");
    if (!maskBase64) throw new Error("Mask is required");

    console.log("Starting geminiInpaint:", { prompt: prompt.substring(0, 50) + "...", aspectRatio, resolution });

    try {
        const client = getClient(apiKey);
        const { data: imgData, mimeType: imgMime } = stripDataUrl(imageBase64);
        const { data: maskData, mimeType: maskMime } = stripDataUrl(maskBase64);

        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: 'Original image:' },
                        imageUrlToBase64Part(imgData, imgMime),
                        { text: 'Mask (white areas = edit here, black = keep unchanged):' },
                        imageUrlToBase64Part(maskData, maskMime),
                        {
                            text: `TECHNICAL SPECIFICATIONS:
- ASPECT RATIO: ${aspectRatio || 'original'}
- RESOLUTION: ${resolution || '4K'}
- Preserve correct proportions and avoid any stretching or distortion.

TASK: ${prompt}. Edit ONLY the masked (white) areas. Keep everything else exactly as it was.`,
                        },
                    ],
                },
            ],
            config: {
                responseModalities: ['TEXT', 'IMAGE'],
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_HARASSMENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                ],
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data && part.inlineData?.mimeType) {
                console.log("geminiInpaint completed successfully.");
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        throw new Error('No image returned from Gemini inpaint');
    } catch (error) {
        console.warn("geminiInpaint failed:", error instanceof Error ? error.message : String(error));
        throw new Error(`Inpaint failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Basic chat function with optional image context.
 * @param apiKey - The Google API key.
 * @param prompt - Chat message.
 * @param imageBase64 - Optional image base64.
 * @returns Response text.
 */
export async function geminiChat(
    apiKey: string,
    prompt: string,
    imageBase64?: string
): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    if (!prompt) throw new Error("Prompt is required");

    console.log("Starting geminiChat:", { prompt: prompt.substring(0, 50) + "..." });

    try {
        const client = getClient(apiKey);
        const parts: Part[] = [];

        if (imageBase64) {
            const { data, mimeType } = stripDataUrl(imageBase64);
            parts.push(imageUrlToBase64Part(data, mimeType));
        }
        parts.push({ text: prompt });

        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [{ role: 'user', parts }],
        });

        const result = response.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
        console.log("geminiChat completed successfully.");
        return result;
    } catch (error) {
        console.warn("geminiChat failed:", error instanceof Error ? error.message : String(error));
        throw new Error(`Chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Generates a new image from scratch based on a prompt.
 * @param apiKey - The Google API key.
 * @param prompt - Description of the image to generate.
 * @param aspectRatio - Optional aspect ratio.
 * @param resolution - Optional resolution.
 * @returns Generated image in base64.
 */
export async function geminiGenerateImage(
    apiKey: string,
    prompt: string,
    aspectRatio?: string,
    resolution?: string
): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    if (!prompt) throw new Error("Prompt is required");

    console.log("Starting geminiGenerateImage:", { prompt: prompt.substring(0, 50) + "...", aspectRatio, resolution });

    try {
        const client = getClient(apiKey);
        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [{
                        text: `Generate a high quality image based on this description: ${prompt}. 
                    TECHNICAL SPECS: Aspect Ratio: ${aspectRatio || '16:9'}, Resolution: ${resolution || '4K'}`
                    }],
                },
            ],
            config: {
                responseModalities: ['IMAGE'],
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_HARASSMENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                ],
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data && part.inlineData?.mimeType) {
                console.log("geminiGenerateImage completed successfully.");
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        throw new Error('No image returned from Gemini generation');
    } catch (error) {
        console.warn("geminiGenerateImage failed:", error instanceof Error ? error.message : String(error));
        throw new Error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Specialized version of prompt enhancement for Character Swap that analyzes both images.
 */
export async function geminiEnhanceSwapPrompt(
    apiKey: string,
    userPrompt: string,
    sourceBase64: string,
    targetBase64: string,
    contextInfo?: string,
    variant: 'local' | 'full-body' = 'local'
): Promise<string> {
    if (!apiKey) throw new Error("API key is required");

    console.log("Starting geminiEnhanceSwapPrompt.");

    try {
        const client = getClient(apiKey);
        const { data: sData, mimeType: sMime } = await resizeImageForGemini(sourceBase64);
        const { data: tData, mimeType: tMime } = await resizeImageForGemini(targetBase64);

        const { IDENTITY_TRANSFER_GEMINI_INSTRUCTION } = await import('./prompts/swap');
        
        const contextHeader = contextInfo ? `CONTEXT: ${contextInfo}\n` : '';
        const userHeader = `USER PROMPT: "${userPrompt}"`;
        const fullPrompt = `${IDENTITY_TRANSFER_GEMINI_INSTRUCTION(variant)}\n\n${contextHeader}${userHeader}`;

        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [{ 
                role: 'user', 
                parts: [
                    { text: "IMAGE 1 (Source Identity):" },
                    imageUrlToBase64Part(sData, sMime),
                    { text: "IMAGE 2 (Target Scene & Pose):" },
                    imageUrlToBase64Part(tData, tMime),
                    { text: fullPrompt }
                ] 
            }],
        });

        const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || userPrompt;
        console.log("geminiEnhanceSwapPrompt completed successfully.");
        return result;
    } catch (error) {
        console.warn("geminiEnhanceSwapPrompt failed (using fallback):", error);
        return userPrompt;
    }
}

/**
 * Enhances a user prompt for better results with Runware/Stable Diffusion.
 */
export async function geminiEnhancePromptForRunware(
    apiKey: string,
    userPrompt: string,
    intentType: string,
    contextInfo?: string,
    imageBase64?: string
): Promise<string> {
    if (!apiKey) throw new Error("API key is required");

    console.log("Starting geminiEnhancePromptForRunware:", { intentType });

    try {
        const client = getClient(apiKey);
        const { data, mimeType } = imageBase64 
            ? await resizeImageForGemini(imageBase64) 
            : { data: '', mimeType: '' };

        let systemInstruction = '';
        const mode = contextInfo?.match(/Mode: (\w+)/)?.[1] || 'studio';

        if (intentType === "FUSION_MULTI_IMAGES") {
            const { IDENTITY_TRANSFER_GEMINI_INSTRUCTION } = await import('./prompts/swap');
            systemInstruction = IDENTITY_TRANSFER_GEMINI_INSTRUCTION('local');
        } else if (intentType === "EDIT_SINGLE_IMAGE") {
            if (mode === 'canvas') {
                systemInstruction = CANVAS_GEMINI_INSTRUCTION;
            } else if (mode === 'outpaint') {
                systemInstruction = OUTPAINT_GEMINI_INSTRUCTION;
            } else if (mode === 'relight') {
                systemInstruction = RELIGHT_GEMINI_INSTRUCTION;
            } else if (mode === 'remove-bg') {
                systemInstruction = REMOVE_BG_GEMINI_INSTRUCTION;
            } else if (mode === 'inpaint' || contextInfo?.toLowerCase().includes('pins')) {
                const { INPAINT_GEMINI_INSTRUCTION } = await import('./prompts/inpaint');
                systemInstruction = INPAINT_GEMINI_INSTRUCTION;
            } else {
                const { EDIT_GEMINI_INSTRUCTION } = await import('./prompts/edit');
                systemInstruction = EDIT_GEMINI_INSTRUCTION;
            }
        } else if (intentType === "QUANTITY_ANALYSIS") {
            const { QUANTITY_ANALYSIS_GEMINI_INSTRUCTION } = await import('./prompts/analysis');
            systemInstruction = QUANTITY_ANALYSIS_GEMINI_INSTRUCTION;
        } else if (intentType === "BLUEPRINT_ANALYSIS") {
            const { BLUEPRINT_ANALYSIS_GEMINI_INSTRUCTION } = await import('./prompts/analysis');
            systemInstruction = BLUEPRINT_ANALYSIS_GEMINI_INSTRUCTION;
        } else {
            systemInstruction = STUDIO_GEMINI_INSTRUCTION;
        }

        const contextHeader = contextInfo ? `CONTEXT: ${contextInfo}\n` : '';
        const userHeader = `USER PROMPT: "${userPrompt}"`;
        const fullPrompt = `${systemInstruction}\n\n${contextHeader}${userHeader}`;

        const parts: Part[] = [];
        if (data) {
            parts.push(imageUrlToBase64Part(data, mimeType));
        }
        parts.push({ text: fullPrompt });

        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [{ role: 'user', parts }],
        });

        const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || userPrompt;
        console.log("geminiEnhancePromptForRunware completed successfully.");
        return result;
    } catch (error) {
        console.warn("geminiEnhancePromptForRunware failed (using fallback):", error instanceof Error ? error.message : String(error));
        return userPrompt; // Fallback
    }
}

/**
 * Analyzes a person in an image for distinctive traits (identity analysis).
 */
export async function geminiAnalyzeIdentity(apiKey: string, imageBase64: string): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    if (!imageBase64) throw new Error("Image base64 is required");

    console.log("Starting geminiAnalyzeIdentity.");

    try {
        const client = getClient(apiKey);
        const { data, mimeType } = stripDataUrl(imageBase64);

        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [{
                role: 'user',
                parts: [
                    {
                        text: `Analyze the subject (person, animal, or object) in this image and describe their most distinctive traits for identity/structure transfer. Organize the analysis into these exact layers:
                
LAYER 1 (Structure/Anatomy): Detailed physical form, bone structure, distinctive features (e.g. tusks, muzzle, eyes, facial structure), and posture.
LAYER 2 (Texture/Surface): Skin/fur/material texture, patterns (e.g. spots, scales), color gradients, and sheen.
LAYER 3 (Clothing/Accoutrements): Any worn items, fabric properties, or integrated gear.
LAYER 4 (Distinctive Markers): Scars, unique biological markers, or characteristic structural parts.

Be extremely precise. Describe textures and shapes clearly.` },
                    imageUrlToBase64Part(data, mimeType)
                ]
            }]
        });
        const result = response.candidates?.[0]?.content?.parts?.[0]?.text || "No specific traits detected";
        console.log("geminiAnalyzeIdentity completed successfully.");
        return result;
    } catch (error) {
        console.warn("geminiAnalyzeIdentity failed:", error instanceof Error ? error.message : String(error));
        throw new Error(`Identity analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Analyzes text elements within an image and returns JSON data.
 */
export async function geminiAnalyzeTextInImage(apiKey: string, imageBase64: string): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    if (!imageBase64) throw new Error("Image base64 is required");

    console.log("Starting geminiAnalyzeTextInImage.");

    try {
        const client = getClient(apiKey);
        const { data, mimeType } = stripDataUrl(imageBase64);

        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [{
                role: 'user',
                parts: [
                    {
                        text: `Analyze all text elements in this image. 
Return a JSON array of objects, where each object has:
- id: unique string
- text: the exact text content
- x, y: center coordinates (%)
- width, height: approximate dimensions (%)
- style: description of font, color, and effects

IMPORTANT: Return ONLY the raw JSON array. No markdown code blocks.` },
                    imageUrlToBase64Part(data, mimeType)
                ]
            }]
        });

        const result = response.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        console.log("geminiAnalyzeTextInImage completed successfully.");
        return result;
    } catch (error) {
        console.warn("geminiAnalyzeTextInImage failed:", error instanceof Error ? error.message : String(error));
        return "[]";
    }
}

/**
 * Analyzes a design and generates a prompt for a commercial mockup.
 */
export async function geminiGenerateMockupPrompt(apiKey: string, imageBase64: string): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    if (!imageBase64) throw new Error("Image base64 is required");

    console.log("Starting geminiGenerateMockupPrompt.");

    try {
        const client = getClient(apiKey);
        const { data, mimeType } = stripDataUrl(imageBase64);

        const response = await client.models.generateContent({
            model: GEMINI_MAIN_MODEL,
            contents: [{
                role: 'user',
                parts: [
                    {
                        text: `Analyze this design/logo. 
Then, generate a high-quality prompt for a realistic commercial mockup scene that would fit this design best (e.g., t-shirt, billboard, bottle). 
The output prompt should describe the scene, lighting, and placement of this design.
Return ONLY the prompt string.` },
                    imageUrlToBase64Part(data, mimeType)
                ]
            }]
        });

        const result = response.candidates?.[0]?.content?.parts?.[0]?.text || "A high-quality commercial mockup";
        console.log("geminiGenerateMockupPrompt completed successfully.");
        return result;
    } catch (error) {
        console.warn("geminiGenerateMockupPrompt failed:", error instanceof Error ? error.message : String(error));
        return "A high-quality commercial mockup";
    }
}
/**
 * Detects an object at specific normalized coordinates.
 */
export async function geminiDetectPointObject(
    apiKey: string,
    imageBase64: string,
    x: number,
    y: number
): Promise<string[]> {
    if (!apiKey) throw new Error("API key is required");
    
    try {
        const client = getClient(apiKey);
        const { data, mimeType } = stripDataUrl(imageBase64);
        const { POINT_DETECTION_PROMPT } = await import('./prompts/analysis');

        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash', // Use Flash for speed
            contents: [
                {
                    role: 'user',
                    parts: [
                        imageUrlToBase64Part(data, mimeType),
                        { text: POINT_DETECTION_PROMPT(x, y) },
                    ],
                },
            ],
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        // Simple JSON extraction to be safe
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const suggestions = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
        return Array.isArray(suggestions) ? suggestions : [];
    } catch (error) {
        console.warn("geminiDetectPointObject failed:", error);
        return [];
    }
}
/**
 * Standardized wrapper for analyzing a masked area with Gemini.
 * Handles resizing, stripping, and robust multimodal request structure.
 */
export async function geminiAnalyzeBrushMask(
    apiKey: string,
    imageBase64: string,
    maskBase64: string,
    prompt: string
): Promise<string> {
    if (!apiKey) throw new Error("API key is required");
    
    console.log("Starting geminiAnalyzeBrushMask:", { prompt: prompt.substring(0, 50) + "..." });

    try {
        const client = getClient(apiKey);
        
        // Resize both to prevent 400 errors from large payloads
        const { data: imgData, mimeType: imgMime } = await resizeImageForGemini(imageBase64);
        const { data: mData, mimeType: mMime } = await resizeImageForGemini(maskBase64);

        const response = await client.models.generateContent({
            model: GEMINI_VISION_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: "Original image for context:" },
                        imageUrlToBase64Part(imgData, imgMime),
                        { text: "Visual mask (White = Target area, Black = Ignore):" },
                        imageUrlToBase64Part(mData, mMime),
                        { text: prompt },
                    ],
                },
            ],
            config: {
                // Ensure we get a clear text response
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_HARASSMENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
                ],
            }
        });

        const result = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log("geminiAnalyzeBrushMask completed successfully.");
        return result.trim();
    } catch (error) {
        console.warn("geminiAnalyzeBrushMask failed:", error);
        throw error;
    }
}
