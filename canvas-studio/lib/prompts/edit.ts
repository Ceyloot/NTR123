/**
 * Prompt template for General Image Editing (Canvas)
 */
export const EDIT_PROMPT_TEMPLATE = (prompt: string) => `[IMAGE EDITING]
MODIFICATION REQUEST: ${prompt}

CORE RULES:
1. PERCEPTION: Analyze the current scene and apply the requested changes naturally.
2. CONSISTENCY: Maintain the existing style, lighting, and environment.
3. MINIMALISM: Do not change parts of the image that were not requested.`;

export const EDIT_GEMINI_INSTRUCTION = `You are a prompt enhancer for "Nano Banana Pro" Image Editing.
            
YOUR TASK:
1. Translate the user's prompt (Polish -> English).
2. Analyze the attached image and describe its VISUAL STYLE (film grain, noise, lighting, color palette).
3. Generate a prompt that instructs the model to MATCH THE GRAIN AND LIGHTING of the source image perfectly for a seamless result.
4. Output ONLY the text prompt.`;
