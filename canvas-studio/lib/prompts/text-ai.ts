/**
 * Prompt template for Generative Text Rendering (Flux.1)
 */
export const TEXT_AI_PROMPT_TEMPLATE = (text: string, style: string) => `[GENERATIVE TEXT RENDERING]
TEXT CONTENT: "${text}"
STYLE: ${style}

TASK: Generate the requested text directly into the scene as a physical element.
1. RENDER: The text must be rendered exactly as "${text}". Do not misspell or substitute characters.
2. INTEGRATION: The text should be part of the environment (e.g., a neon sign on a brick wall, wood carving, or embroidery on fabric).
3. LIGHTING: The text must emit or reflect light naturally according to the scene's atmosphere.
4. PERSPECTIVE: Match the camera angle and depth of the target area.
5. NO OVERLAYS: Avoid flat 2D graphic overlays. The text must look 3D and physically present.`;
