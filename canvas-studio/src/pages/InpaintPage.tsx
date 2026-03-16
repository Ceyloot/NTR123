import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Brush, Eraser, Undo2, Layers, Loader2, Download, Copy, Trash2, Library, RefreshCw, Upload, MousePointer2, Image as ImageIcon } from 'lucide-react';
import { runwareInpaint, snapToSupportedDimensions } from '@/lib/runware';
import { useChatStore } from '@/store/chatStore';
import { useLibraryStore } from '@/store/libraryStore';
import Notification from '@/components/layout/Notification';

const toBase64 = (src: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (src.startsWith('data:')) return resolve(src);
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = reject;
        img.src = src;
    });
};

const resizeBase64 = (base64Str: string, width: number, height: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = base64Str;
    });
};

export default function InpaintPage() {
    const { apiKeys } = useChatStore();
    const { addItem } = useLibraryStore();
    const [image, setImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timer, setTimer] = useState(0);

    // Timer logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isLoading) {
            interval = setInterval(() => setTimer((t) => t + 1), 1000);
        } else {
            setTimer(0);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    const formatTime = (s: number) => {
        const mm = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = (s % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    };

    // Canvas tools
    const [activeTool, setActiveTool] = useState<'brush' | 'eraser'>('brush');
    const [brushSize, setBrushSize] = useState(30);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    const [isNotificationVisible, setIsNotificationVisible] = useState(false);

    // Setup canvas when image loads
    const onImageLoad = useCallback(() => {
        if (imageRef.current && canvasRef.current) {
            const img = imageRef.current;
            const cvs = canvasRef.current;

            // Ensure we have dimensions
            const displayWidth = img.clientWidth || img.width;
            const displayHeight = img.clientHeight || img.height;

            if (displayWidth > 0 && displayHeight > 0) {
                // Match canvas size to displayed image size
                cvs.width = displayWidth;
                cvs.height = displayHeight;
                cvs.style.width = `${displayWidth}px`;
                cvs.style.height = `${displayHeight}px`;

                const context = cvs.getContext('2d');
                if (context) {
                    context.lineCap = 'round';
                    context.lineJoin = 'round';
                    setCtx(context);
                }
            }
        }
    }, [image]);

    // Re-setup on resize and ensure it runs if image is already cached
    useEffect(() => {
        if (image && imageRef.current?.complete) {
            onImageLoad();
        }
        window.addEventListener('resize', onImageLoad);
        return () => window.removeEventListener('resize', onImageLoad);
    }, [onImageLoad, image]);

    // Drawing handlers
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        draw(e);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        if (ctx) ctx.beginPath(); // reset path
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !ctx || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // Calculate scale to map screen pixels to canvas coordinates accurately
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        ctx.lineWidth = brushSize;

        if (activeTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(239, 68, 68, 1)'; // Solid red to avoid layering
        }

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const clearMask = () => {
        if (ctx && canvasRef.current) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    };

    const generateAIImage = async () => {
        if (!image || !prompt || !canvasRef.current || !imageRef.current) return;

        const apiKey = apiKeys.runware || import.meta.env.VITE_RUNWARE_API_KEY;
        if (!apiKey) {
            setError("Brak klucza API Runware.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 1. Prepare base image
            const base64Img = await toBase64(image);
            const naturalWidth = imageRef.current.naturalWidth;
            const naturalHeight = imageRef.current.naturalHeight;

            // 2. Generate final mask (Black background, White mask for AI)
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = naturalWidth;
            offscreenCanvas.height = naturalHeight;
            const oCtx = offscreenCanvas.getContext('2d')!;

            // Fill black background
            oCtx.fillStyle = 'black';
            oCtx.fillRect(0, 0, naturalWidth, naturalHeight);

            // Draw the UI mask
            oCtx.drawImage(canvasRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height, 0, 0, naturalWidth, naturalHeight);

            // Create a dedicated transparent mask specifically for client-side compositing
            const compositeMaskCanvas = document.createElement('canvas');
            compositeMaskCanvas.width = naturalWidth;
            compositeMaskCanvas.height = naturalHeight;
            const cmCtx = compositeMaskCanvas.getContext('2d')!;

            // Draw UI strokes and convert to solid black (to punch hole)
            cmCtx.drawImage(canvasRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height, 0, 0, naturalWidth, naturalHeight);
            cmCtx.globalCompositeOperation = 'source-in';
            cmCtx.fillStyle = '#000000';
            cmCtx.fillRect(0, 0, naturalWidth, naturalHeight);

            // Convert red drawing strokes to pure white for API on offscreenCanvas
            const imgData = oCtx.getImageData(0, 0, naturalWidth, naturalHeight);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                // Check if Red channel > 0
                if (data[i] > 0) {
                    data[i] = 255;
                    data[i + 1] = 255;
                    data[i + 2] = 255;
                    data[i + 3] = 255;
                } else {
                    data[i] = 0;
                    data[i + 1] = 0;
                    data[i + 2] = 0;
                    data[i + 3] = 255;
                }
            }
            oCtx.putImageData(imgData, 0, 0);

            const finalMaskBase64Raw = offscreenCanvas.toDataURL('image/png');

            // Resize to snapped Runware dimensions before API call to ensure exact alignment
            const { width: snappedW, height: snappedH } = snapToSupportedDimensions(naturalWidth, naturalHeight);
            const base64ImgSnapped = await resizeBase64(base64Img, snappedW, snappedH);
            const finalMaskBase64 = await resizeBase64(finalMaskBase64Raw, snappedW, snappedH);

            // 3. Make runware API call using the pre-snapped sizes and the BW mask
            const aiImageUrl = await runwareInpaint(apiKey, base64ImgSnapped, finalMaskBase64, prompt, snappedW, snappedH);

            // 4. Client-side Mask Compositing
            // Imagen 3 doesn't support strict masking natively via API. It generates a full image.
            // We use HTML5 Canvas to physically cut out the generated edit and paste it perfectly back into the original unmodified image.
            const compositeCanvas = document.createElement('canvas');
            compositeCanvas.width = naturalWidth;
            compositeCanvas.height = naturalHeight;
            const cCtx = compositeCanvas.getContext('2d')!;

            // c) Draw the AI generated image *behind* the original image so it only peeks through the mask hole
            const aiImg = new window.Image();
            aiImg.crossOrigin = 'anonymous';
            aiImg.src = aiImageUrl;
            await new Promise((resolve) => { aiImg.onload = resolve; });

            // a) Draw the original crystal-clear photo
            cCtx.drawImage(imageRef.current, 0, 0);

            // b) Punch a hole precisely where the user painted the mask (with feathered edges)
            cCtx.globalCompositeOperation = 'destination-out';

            // Use ctx.filter for superior, more consistent blurring than shadowBlur
            cCtx.filter = 'blur(12px)';

            // Draw the mask to punch the hole
            cCtx.drawImage(compositeMaskCanvas, 0, 0, naturalWidth, naturalHeight);

            // Clear filter for the next operation
            cCtx.filter = 'none';

            cCtx.globalCompositeOperation = 'destination-over';
            cCtx.drawImage(aiImg, 0, 0, naturalWidth, naturalHeight);

            const finalCompositedUrl = compositeCanvas.toDataURL('image/png');

            setResultImage(finalCompositedUrl);

            // Add to library
            addItem({
                url: finalCompositedUrl,
                originalUrl: image,
                tool: 'inpaint',
                prompt: prompt
            });

            setIsNotificationVisible(true);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Błąd generowania. Spróbuj ponownie.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setImage(event.target.result as string);
                setResultImage(null);
                setPrompt("");
                setError(null);
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <main className="canvas-main" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>

            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-header-icon">
                        <Brush size={20} />
                    </div>
                    <div className="app-header-info">
                        <h1>Inpaint (Edycja Fragmentu)</h1>
                        <p>Zaznacz obiekt i wpisz co ma się pojawić</p>
                    </div>
                </div>

                <div className="app-header-right">
                    {resultImage && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => { setImage(null); setResultImage(null); setPrompt(""); }} className="lightbox-btn" style={{ height: '38px' }}>
                                <RefreshCw size={14} />
                                <span>Nowe Zdjęcie</span>
                            </button>
                            <a href={resultImage} download={`inpaint-${Date.now()}.png`} className="lightbox-btn primary" style={{ textDecoration: 'none', height: '38px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Download size={14} />
                                <span>Pobierz PNG</span>
                            </a>
                        </div>
                    )}
                </div>
            </header>

            <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>

                {!image ? (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                width: '100%', maxWidth: '800px', minHeight: '400px',
                                background: 'rgba(18, 18, 28, 0.4)', border: '2px dashed var(--border)',
                                borderRadius: '24px', position: 'relative', overflow: 'hidden',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.3s'
                            }}
                        >
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', margin: '0 auto 20px' }}>
                                    <Upload size={32} />
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Wgraj zdjęcie</h3>
                                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Kliknij, aby wgrać zdjęcie do edycji</p>
                            </div>
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileUpload} />
                        </div>
                    </div>
                ) : (
                    <div className="studio-workspace">
                        {/* Floating Control Panel */}
                        <div className="studio-panel-floating">
                            <div>
                                <h3 className="tool-section-title" style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>Narzędzie</h3>
                                <div className="visual-card-list">
                                    <button
                                        className={`visual-card ${activeTool === 'brush' ? 'active' : ''}`}
                                        onClick={() => setActiveTool('brush')}
                                        style={{ background: activeTool === 'brush' ? 'rgba(14, 165, 233, 0.1)' : 'rgba(255,255,255,0.02)' }}
                                    >
                                        <div className="visual-card-graphic" style={{ width: '40px', height: '40px', background: 'rgba(59, 130, 246, 0.1)' }}>
                                            <Brush size={18} className="text-accent" />
                                        </div>
                                        <div className="visual-card-info">
                                            <span className="visual-card-name" style={{ fontSize: '13px' }}>Pędzel</span>
                                            <span className="visual-card-desc" style={{ fontSize: '10px' }}>Malowanie maski</span>
                                        </div>
                                    </button>
                                    <button
                                        className={`visual-card ${activeTool === 'eraser' ? 'active' : ''}`}
                                        onClick={() => setActiveTool('eraser')}
                                        style={{ background: activeTool === 'eraser' ? 'rgba(14, 165, 233, 0.1)' : 'rgba(255,255,255,0.02)' }}
                                    >
                                        <div className="visual-card-graphic" style={{ width: '40px', height: '40px', background: 'rgba(239, 68, 68, 0.1)' }}>
                                            <Eraser size={18} style={{ color: 'var(--red)' }} />
                                        </div>
                                        <div className="visual-card-info">
                                            <span className="visual-card-name" style={{ fontSize: '13px' }}>Gumka Maski</span>
                                            <span className="visual-card-desc" style={{ fontSize: '10px' }}>Usuwanie maski</span>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="premium-slider-group">
                                <div className="premium-slider-header">
                                    <span className="premium-slider-label">Rozmiar Pędzla</span>
                                    <span className="premium-slider-value">{brushSize}px</span>
                                </div>
                                <input
                                    type="range"
                                    min="5" max="150"
                                    value={brushSize}
                                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                    className="premium-range"
                                />
                            </div>

                            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button
                                    onClick={clearMask}
                                    className="lightbox-btn"
                                    style={{ width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,0.03)' }}
                                >
                                    <Trash2 size={16} /> Wyczyść Maskę
                                </button>
                                <button
                                    onClick={() => { setImage(null); setResultImage(null); }}
                                    className="lightbox-btn"
                                    style={{ width: '100%', justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)' }}
                                >
                                    Wgraj Nowe
                                </button>
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="studio-main-content">
                            {/* Main Workspace Area */}
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', paddingBottom: '100px' }}>
                                {/* Base Image & Canvas Wrapper */}
                                <div style={{ position: 'relative' }}>
                                    {/* Base Image */}
                                    <img
                                        ref={imageRef}
                                        src={resultImage || image}
                                        alt="Base"
                                        onLoad={resultImage ? undefined : onImageLoad}
                                        style={{ maxWidth: '100%', maxHeight: '45vh', display: 'block', borderRadius: '20px', pointerEvents: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}
                                    />

                                    {/* Drawing Canvas Overlay */}
                                    {!resultImage && (
                                        <canvas
                                            ref={canvasRef}
                                            onMouseDown={startDrawing}
                                            onMouseMove={draw}
                                            onMouseUp={stopDrawing}
                                            onMouseLeave={stopDrawing}
                                            onTouchStart={startDrawing}
                                            onTouchMove={draw}
                                            onTouchEnd={stopDrawing}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                cursor: activeTool === 'eraser' ? 'cell' : 'crosshair',
                                                zIndex: 10,
                                                touchAction: 'none',
                                                borderRadius: '20px',
                                                opacity: 0.2 // Solid color + CSS opacity prevents stacking effect
                                            }}
                                        />
                                    )}


                                </div>
                            </div>

                            {/* Floating Bottom Bar */}
                            <div className="studio-bottom-bar-floating">
                                <div className="studio-floating-input-group">
                                    <input
                                        type="text"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Co chcesz wygenerować w zaznaczonym miejscu?..."
                                        className="studio-floating-input"
                                        onKeyDown={(e) => { if (e.key === 'Enter') generateAIImage(); }}
                                    />
                                    <button
                                        onClick={generateAIImage}
                                        disabled={isLoading || !prompt.trim()}
                                        className="studio-floating-btn"
                                    >
                                        {isLoading ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
                                        <span>Generuj Zmiany</span>
                                    </button>
                                </div>
                                {error && (
                                    <p style={{ color: 'var(--red)', fontSize: '13px', padding: '0 16px 8px', textAlign: 'center' }}>{error}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <Notification
                message="Zmiany zostały zapisane w bibliotece!"
                isVisible={isNotificationVisible}
                onClose={() => setIsNotificationVisible(false)}
            />
            {/* Progress Overlay */}
            {isLoading && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ width: '100%', maxWidth: '400px' }}>
                        <div className="msg-loading-enhanced-container">
                            {/* Phase 1: Analysis */}
                            <div className={`msg-loading-enhanced ${timer > 5 ? 'completed' : ''}`}>
                                <div className="msg-loading-header">
                                    {timer > 5 ? <Sparkles size={16} className="text-green-400" /> : <Loader2 size={16} className="spin" />}
                                    <span>{timer > 5 ? 'Zakończono analizę' : 'Analizowanie zdjęcia...'}</span>
                                    <span className="timer-badge">{timer > 5 ? '5s / 05s' : `${formatTime(timer)} / 00:05`}</span>
                                </div>
                                <div className="progress-bar-container">
                                    <div className="progress-bar-fill" style={{ width: `${Math.min(100, (timer / 5) * 100)}%`, backgroundColor: timer > 5 ? '#4ade80' : undefined }} />
                                </div>
                                <div className="executing-label">{timer > 5 ? 'ZAKOŃCZONO' : 'EXECUTING'}</div>
                            </div>

                            {/* Phase 2: Generation */}
                            {timer > 5 && (
                                <div className="msg-loading-enhanced mt-3 animate-in fade-in slide-in-from-top-2 duration-500">
                                    <div className="msg-loading-header">
                                        <Loader2 size={16} className="spin" />
                                        <span>Generowanie detali...</span>
                                        <span className="timer-badge">{formatTime(Math.max(0, timer - 5))} / 00:30</span>
                                    </div>
                                    <div className="progress-bar-container">
                                        <div className="progress-bar-fill" style={{ width: `${Math.min(100, ((timer - 5) / 30) * 100)}%`, backgroundColor: timer > 20 ? '#ffb340' : undefined }} />
                                    </div>
                                    <div className="executing-label">{timer > 20 ? 'FINALIZOWANIE...' : 'EXECUTING'}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </main>
    );
}
