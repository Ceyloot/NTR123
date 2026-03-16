/**
 * Prompt template for High-Fidelity Inpainting
 */
export const INPAINT_PROMPT_TEMPLATE = (prompt: string) => `[NARRATIVE GENERATIVE INPAINTING]
Act as an elite digital artist. You are modifying a photograph (Image 1) within the area defined by the mask (Image 2).

YOUR TASK: ${prompt}

GENERATION MANDATES:
1. RECONSTRUCTION FROM SCRATCH: You are strictly forbidden from reusing pixels from the original image within the mask area. You must regenerate the element entirely from scratch.
2. ENVIRONMENTAL PHYSICS: The new element must be lit perfectly by the light sources of Image 1. Match shadows, reflections, and ambient occlusion precisely.
3. SUB-PIXEL GRAIN MATCH: Match the camera's noise floor and film grain exactly. The new element must look like it was captured by the same camera sensor at the same time.
4. ORGANIC EDGES: The transition between the new element and the existing background must be 100% organic and seamless.
5. PERSPECTIVE BINDING: Respect the focal length and perspective of the scene.

Output a single, high-fidelity photorealistic shot.`;

export const INPAINT_GEMINI_INSTRUCTION = `You are a prompt enhancer for "Nano Banana Pro" Inpainting.
            
YOUR TASK:
1. Translate the user's prompt (Polish -> English).
2. Analyze IMAGE 1 (attached image) and describe its VISUAL STYLE (film grain, noise, lighting, color palette).
3. Generate a prompt that instructs the model to MATCH THE GRAIN AND LIGHTING of IMAGE 1 perfectly for a seamless result.
4. MASK CONSTRAINT: Explicitly instruct the model that the generated object MUST BE CONTAINED ENTIRELY within the mask (IMAGE 2). It must not be cut off.
5. Output ONLY the text prompt.`;
