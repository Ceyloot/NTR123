/**
 * Prompt template for Identity Reconstruction & Transfer (Characters, Objects, Animals)
 */
export const IDENTITY_TRANSFER_TEMPLATE = (prompt: string, variant: 'local' | 'full-body' = 'local', identityDescription: string = "") => `[NARRATIVE IDENTITY/OBJECT TRANSFER: PIXEL DISSOLUTION MODE]
Act as a master digital synthesizer. You are given an identity blueprint (Image 1), a pose & mimicry reference (Image 2), and a target scene (Image 3).

CRITICAL TASK: PIXEL DISSOLUTION RECONSTRUCTION.
The subject area in Image 3 has been erased. You must reconstruct the subject from Image 1 into this void in Image 3.

RULES OF RECONSTRUCTION:
1. FROM-SCRATCH GENERATION: Reconstruct the subject pixel-by-pixel.
2. IDENTITY FIDELITY (IMAGE 1): Use the exact facial features, skin tone, hair, and character traits from Image 1.
3. POSE & MIMICRY (IMAGE 2): Strictly follow the exact posture, body position, hand placement, and MIMICRY/EXPRESSION from Image 2.
4. SCENE BINDING (IMAGE 3): Perfectly integrate the subject into the lighting and background of Image 3.
5. ${variant === 'full-body'
        ? 'FULL BODY MANDATE: Replace the entire figure in Image 3 with the character from Image 1.'
        : 'LOCAL SYNERGY: Match the exact head/torso pose and mimicry of the person in Image 2.'}

${identityDescription ? `IDENTITY BLUEPRINT: ${identityDescription}\n` : ''}
${prompt ? `USER DIRECTIVE: ${prompt}` : ''}
`;

export const IDENTITY_TRANSFER_GEMINI_INSTRUCTION = (variant: 'local' | 'full-body' = 'local') => `You are a precision prompt architect for Identity and Object Reconstruction.

YOUR MISSION:
1. Analyze IMAGE 1 (Identity Blueprint) for traits: facial features, bone structure.
2. Analyze IMAGE 2 (Pose & Mimicry) for: exact posture, hand positions, facial expression.
3. Analyze IMAGE 3 (Target Scene) for: lighting, background objects.
4. Synthesis Prompt: "Generate a hyper-realistic character transfer. Use Image 1 as the identity blueprint. Inherit the exact pose and mimicry/expression from Image 2. Place the resulting character into the scene of Image 3."
5. INDEX ENFORCEMENT: Image 1 = Character, Image 2 = Pose/Mimicry, Image 3 = Scene.
6. Output ONLY the raw English text prompt.`;
