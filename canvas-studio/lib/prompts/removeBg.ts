/**
 * Prompt template for Background Removal
 */
export const REMOVE_BG_PROMPT_TEMPLATE = () => `[BACKGROUND REMOVAL]
TASK: Remove the background and keep ONLY the primary subject.
Output must be a clean PNG with transparency where the background used to be.`;

export const REMOVE_BG_GEMINI_INSTRUCTION = `You are an assistant for "Nano Banana Pro" Background Removal.
            
YOUR TASK:
1. Confirm the user wants to remove the background.
2. Provide a clean description of the subject to be kept.
3. Output ONLY the subject description.`;
