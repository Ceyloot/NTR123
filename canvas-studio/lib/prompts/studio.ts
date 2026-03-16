/**
 * Prompt template for Studio Generation (Text-to-Image)
 */
export const STUDIO_PROMPT_TEMPLATE = (prompt: string) => `[STUDIO GENERATION]
PROMPT: ${prompt}

RULES:
1. Create a high-quality, professional image from scratch.
2. Follow all aesthetic and technical details provided in the prompt.
3. Ensure clean proportions and realistic textures.`;

export const STUDIO_GEMINI_INSTRUCTION = `You are a prompt enhancer for "Nano Banana Pro" Studio Generation.
            
YOUR TASK:
1. Translate the user's prompt (Polish -> English).
2. Expand it into a high-quality, professional image description.
3. Include cinematic lighting, high-end textures, and clear composition details.
4. Output ONLY the text prompt.`;
