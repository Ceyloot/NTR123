/**
 * Identity Reconstruction & Environmental Fusion
 * Used for "Postać & Sceneria" (Character Fusion)
 */
export const CHARACTER_FUSION_TEMPLATE = (prompt: string, variant: 'local' | 'full-body' = 'local', identityDescription: string = "") => `[NARRATIVE IDENTITY RECONSTRUCTION: PIXEL DISSOLUTION MODE]
Act as an elite generative artist. You are given an identity blueprint (Image 1) and a target scene (Image 2). A mask (Image 3) defines the area.

CRITICAL TASK: PIXEL DISSOLUTION.
The area defined by Image 3 in Image 2 has been completely dissolved into empty latent noise. It is a VOID. You must HALLUCINATE the identity from Image 1 into this void.

IDENTITY PROFILE (TRAITS TO RECONSTRUCT):
${identityDescription || "Precisely reconstruct the person from Image 1."}

STRICT GENERATION MANDATES:
1. TOTAL BAN ON CLONING: Do not copy-paste, blend, or warp pixels from Image 1. The subject in the final output must be 100% newly generated.
2. TRAIT FIDELITY: Maintain the exact bone structure, facial hair (mustache), glasses, hair style, and clothing details from the Identity Blueprint (Image 1).
3. ENVIRONMENTAL PHYSICS: The generated subject must follow the lighting, color temperature, and perspective of Image 2 exactly.
4. ${variant === 'full-body' 
    ? 'FULL BODY CONSTRUCTION: Hallucinate a COMPLETE person from head to toe, grounded perfectly on the floor of the scene.' 
    : 'NATURAL POSE INTEGRATION: Match the framing and scale of the target area in Image 2 perfectly.'}
5. ZERO ARTIFACTS: The person must be part of the scene's atmosphere, not added onto it.

${prompt ? `USER DIRECTION: ${prompt}` : ''}
`;
