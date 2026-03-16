/**
 * Utility functions for image processing and mask manipulation.
 */

export async function expandMaskToBottom(maskBase64: string, w: number, h: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);

            // Find the bounding box of the current mask
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            let minY = h;
            let minX = w;
            let maxX = 0;

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const alpha = data[(y * w + x) * 4 + 3];
                    const red = data[(y * w + x) * 4];
                    if (alpha > 50 && red > 50) { // White/Grey areas in mask
                        if (y < minY) minY = y;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                    }
                }
            }

            if (minY < h) {
                // Fill from minY to bottom
                ctx.fillStyle = 'white';
                // We slightly expand horizontally too to give room for legs stance
                const padding = (maxX - minX) * 0.2;
                ctx.fillRect(Math.max(0, minX - padding), minY, Math.min(w, (maxX - minX) + padding * 2), h - minY);
            }

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = maskBase64;
    });
}

/**
 * Seamlessly blends the AI-generated result back into the original image using a feathered mask.
 * Ensures the output dimensions strictly match the original (w, h).
 */
export async function surgicalComposite(
    originalSrc: string, 
    aiResultSrc: string, 
    maskSrc: string, 
    w: number, 
    h: number
): Promise<string> {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;

        const origImg = new window.Image();
        const aiImg = new window.Image();
        const maskImg = new window.Image();
        let loaded = 0;
        const onLoaded = () => {
            loaded++;
            if (loaded === 3) {
                // 1. Draw original
                ctx.drawImage(origImg, 0, 0, w, h);

                // 2. Prepare feathered mask on a temporary canvas
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = w;
                maskCanvas.height = h;
                const mCtx = maskCanvas.getContext('2d')!;
                mCtx.filter = 'blur(10px)'; // SOFT BLEND
                mCtx.drawImage(maskImg, 0, 0, w, h);

                // 3. Composite AI result only through mask
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tCtx = tempCanvas.getContext('2d')!;
                tCtx.drawImage(aiImg, 0, 0, w, h);
                tCtx.globalCompositeOperation = 'destination-in';
                tCtx.drawImage(maskCanvas, 0, 0);

                // 4. Final blend
                ctx.drawImage(tempCanvas, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.95));
            }
        };
        origImg.crossOrigin = 'anonymous';
        aiImg.crossOrigin = 'anonymous';
        maskImg.crossOrigin = 'anonymous';
        origImg.onload = onLoaded;
        aiImg.onload = onLoaded;
        maskImg.onload = onLoaded;
        origImg.src = originalSrc;
        aiImg.src = aiResultSrc;
        maskImg.src = maskSrc;
    });
}

/**
 * Checks if a mask is essentially empty (less than 1% white pixels).
 */
export async function isMaskEmpty(maskBase64: string): Promise<boolean> {
    return new Promise((resolve) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const w = img.width;
            const h = img.height;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, w, h).data;
            let whitePixels = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 128) whitePixels++;
            }
            const ratio = whitePixels / (w * h);
            resolve(ratio < 0.005); // Less than 0.5%
        };
        img.src = maskBase64;
    });
}

/**
 * Takes a mask (e.g. from Source Identity) and centers/scales it onto a Target Scene dimensions.
 */
export async function createCenteredMaskFromSource(
    sourceMaskBase64: string,
    targetW: number,
    targetH: number
): Promise<string> {
    return new Promise((resolve) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, targetW, targetH);

            // Calculate scale to fit person reasonably (e.g. 70% of target height)
            const targetSize = targetH * 0.7;
            const scale = targetSize / img.height;
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const x = (targetW - drawW) / 2;
            const y = (targetH - drawH); // Grounded at bottom

            ctx.drawImage(img, x, y, drawW, drawH);
            resolve(canvas.toDataURL('image/png'));
        };
        img.src = sourceMaskBase64;
    });
}
