import {
    runwareEditImage,
    runwareInpaint,
    runwareChat,
    runwareGenerateImage,
    runwareCharacterSwap,
    runwareRemoveBackground,
} from './runware';

export type AIRequestType =
    | 'generate'
    | 'edit'
    | 'removeBackground'
    | 'upscale'
    | 'inpaint'
    | 'transfer'
    | 'chat';

export interface AIRequest {
    type: AIRequestType;
    prompt: string;
    imageBase64?: string;       // primary image (base64 or URL)
    maskBase64?: string;        // inpaint mask
    sourceImageBase64?: string; // for swap/transfer
    targetImageBase64?: string; // for swap/transfer
    sourceDescription?: string; // for advanced swap
    targetDescription?: string; // for advanced swap
    runwareApiKey: string;
}

export interface AIResult {
    imageUrl?: string;
    text?: string;
}

export async function processAIRequest(req: AIRequest): Promise<AIResult> {
    switch (req.type) {
        case 'generate':
            if (!req.runwareApiKey) {
                throw new Error('generate requires runwareApiKey');
            }
            return {
                imageUrl: await runwareGenerateImage(req.runwareApiKey, req.prompt),
            };

        case 'edit':
            if (!req.imageBase64 || !req.runwareApiKey) {
                throw new Error('edit requires imageBase64 and runwareApiKey');
            }
            return {
                imageUrl: await runwareEditImage(req.runwareApiKey, req.imageBase64, req.prompt),
            };

        case 'removeBackground':
            if (!req.imageBase64 || !req.runwareApiKey) {
                throw new Error('removeBackground requires imageBase64 and runwareApiKey');
            }
            return {
                imageUrl: await runwareRemoveBackground(req.runwareApiKey, req.imageBase64),
            };

        case 'upscale':
            throw new Error('upscale is temporarily unavailable via Gemini without custom implementation.');

        case 'inpaint':
            if (!req.imageBase64 || !req.runwareApiKey) {
                throw new Error('inpaint requires imageBase64 and runwareApiKey');
            }
            if (!req.maskBase64) {
                return {
                    imageUrl: await runwareEditImage(req.runwareApiKey, req.imageBase64, req.prompt),
                };
            }
            // Runware inpaint with mask
            return {
                imageUrl: await runwareInpaint(
                    req.runwareApiKey,
                    req.imageBase64,
                    req.maskBase64,
                    req.prompt
                ),
            };

        case 'transfer':
            if (!req.sourceImageBase64 || !req.targetImageBase64 || !req.maskBase64 || !req.runwareApiKey) {
                throw new Error('transfer requires sourceImageBase64, targetImageBase64, maskBase64, and runwareApiKey');
            }
            // For character swap, we use the advanced prompt
            const swapResult = await runwareCharacterSwap(
                req.runwareApiKey,
                req.sourceImageBase64,
                req.targetImageBase64,
                req.maskBase64,
                req.sourceDescription || 'Person from reference image',
                req.targetDescription || 'Person in the scene',
                req.prompt
            );
            return {
                imageUrl: swapResult.imageUrl,
                text: swapResult.text,
            };

        case 'chat':
            return {
                text: await runwareChat(req.runwareApiKey, req.prompt, req.imageBase64),
            };

        default:
            throw new Error(`Unknown AI request type: ${req.type}`);
    }
}

// Detect intent from prompt text
export function detectIntent(prompt: string): AIRequestType {
    const lower = prompt.toLowerCase();

    // Character swap keywords
    const swapKeywords = [
        'zamień', 'podmień', 'swap', 'wymień', 'wstaw', 'wklej',
        'character swap', 'face swap', 'identity transfer',
        'osoba', 'postać', 'na niego', 'na nią', 'w miejsce', 'zamiast'
    ];
    if (swapKeywords.some(kw => lower.includes(kw)) && (lower.includes('z') || lower.includes('na') || lower.includes('w') || lower.includes('from') || lower.includes('with') || lower.includes('jako'))) {
        return 'transfer';
    }

    if (lower.includes('transfer') || lower.includes('przenieś') || lower.includes('skopiuj element')) return 'transfer';
    if (lower.includes('inpaint') || lower.includes('zamień') || lower.includes('replace') || lower.includes('fill')) return 'inpaint';
    if (lower.includes('remove bg') || lower.includes('usuń tło') || lower.includes('background')) return 'removeBackground';
    if (lower.includes('upscale') || lower.includes('powiększ') || lower.includes('sharpen')) return 'upscale';
    if (lower.includes('edit') || lower.includes('edytuj') || lower.includes('zmień') || lower.includes('change') || lower.includes('remove')) return 'edit';
    if (lower.includes('generate') || lower.includes('stwórz') || lower.includes('create') || lower.includes('wygeneruj')) return 'generate';
    return 'edit';
}
