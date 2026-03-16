import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Maximize, Image as ImageIcon, Loader2, Download, Copy, RefreshCw, Layers, Library } from 'lucide-react';
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

const RATIOS = [
    { label: 'Oryginał', value: 'original', desc: 'Zachowaj rozmiar' },
    { label: '1:1 Kwadrat', value: '1:1', desc: 'Idealny na Instagram' },
    { label: '16:9 Krajobraz', value: '16:9', desc: 'Panoramiczny format wideo' },
    { label: '9:16 Pion (Social)', value: '9:16', desc: 'Format TikTok / Reels' },
    { label: '4:5 Portret', value: '4:5', desc: 'Klasyczne ujęcie pionowe' },
    { label: '3:2 Klasyk', value: '3:2', desc: 'Standardowy format aparatu' }
];

export default function OutpaintPage() {
    const { apiKeys } = useChatStore();
    const { addItem } = useLibraryStore();
    const [image, setImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState("extend the background seamlessly, high quality, consistent lighting");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isNotificationVisible, setIsNotificationVisible] = useState(false);
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

    // Preview image src depending on aspect ratio padding
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    // Calculate padded image
    useEffect(() => {
        if (!image || aspectRatio === 'original') {
            setPreviewImage(image);
            return;
        }

        const createPreview = async () => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;

                let targetW = img.naturalWidth;
                let targetH = img.naturalHeight;

                if (aspectRatio !== 'original') {
                    const [w, h] = aspectRatio.split(':').map(Number);
                    const currentRatio = img.naturalWidth / img.naturalHeight;
                    const targetRatio = w / h;

                    if (targetRatio > currentRatio) {
                        // Target is wider, pad sides
                        targetW = img.naturalHeight * targetRatio;
                        targetH = img.naturalHeight;
                    } else {
                        // Target is taller, pad top/bottom
                        targetH = img.naturalWidth / targetRatio;
                        targetW = img.naturalWidth;
                    }
                }

                canvas.width = targetW;
                canvas.height = targetH;

                // Fill with checkerboard or dark color for preview
                ctx.fillStyle = '#0a0a0f'; // Dark background for padding
                ctx.fillRect(0, 0, targetW, targetH);

                // Draw original image in center
                const dx = (targetW - img.naturalWidth) / 2;
                const dy = (targetH - img.naturalHeight) / 2;
                ctx.drawImage(img, dx, dy);

                // Add dashed border for UI preview
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.setLineDash([10, 10]);
                ctx.lineWidth = 4;
                ctx.strokeRect(dx, dy, img.naturalWidth, img.naturalHeight);

                setPreviewImage(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.src = image;
        };

        createPreview();
    }, [image, aspectRatio]);

    const generateOutpaint = async () => {
        if (!image || !prompt) return;

        const apiKey = apiKeys.runware || import.meta.env.VITE_RUNWARE_API_KEY;
        if (!apiKey) {
            setError("Brak klucza API Runware.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = image;
            });

            let targetW = img.naturalWidth;
            let targetH = img.naturalHeight;

            if (aspectRatio !== 'original') {
                const [w, h] = aspectRatio.split(':').map(Number);
                const currentRatio = img.naturalWidth / img.naturalHeight;
                const targetRatio = w / h;

                if (targetRatio > currentRatio) {
                    targetW = img.naturalHeight * targetRatio;
                    targetH = img.naturalHeight;
                } else {
                    targetH = img.naturalWidth / targetRatio;
                    targetW = img.naturalWidth;
                }
            } else {
                // If original, just return original to avoid pointless API call
                setResultImage(image);
                setIsLoading(false);
                return;
            }

            // 1. Prepare Base Padded Image (Black background, Original in center)
            const baseCanvas = document.createElement('canvas');
            baseCanvas.width = targetW;
            baseCanvas.height = targetH;
            const bCtx = baseCanvas.getContext('2d')!;

            // 1a. Fill background with a stretched, blurred version of the image
            // This prevents the AI from hallucinating black "letterbox" borders!
            bCtx.filter = 'blur(60px)';
            bCtx.drawImage(img, -20, -20, targetW + 40, targetH + 40); // Slightly larger to avoid edge artifacts of the blur
            bCtx.filter = 'none';

            const dx = (targetW - img.naturalWidth) / 2;
            const dy = (targetH - img.naturalHeight) / 2;
            bCtx.drawImage(img, dx, dy);

            const base64ImgRaw = baseCanvas.toDataURL('image/jpeg', 0.95);

            // 2. Prepare Mask Image (White where padding is, Black where original image is)
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = targetW;
            maskCanvas.height = targetH;
            const mCtx = maskCanvas.getContext('2d')!;

            // Fill entirely with white (area to edit)
            mCtx.fillStyle = 'white';
            mCtx.fillRect(0, 0, targetW, targetH);

            // Fill original image area with black (do not edit)
            // We shrink the black area by 4 pixels to force the AI to blend over the seam
            mCtx.fillStyle = 'black';
            const overlap = 4;
            mCtx.fillRect(dx + overlap, dy + overlap, img.naturalWidth - (overlap * 2), img.naturalHeight - (overlap * 2));

            const maskBase64Raw = maskCanvas.toDataURL('image/png');

            // Resize to snapped Runware dimensions before API call to avoid 504 mismatches
            const { width: snappedW, height: snappedH } = snapToSupportedDimensions(targetW, targetH);
            const base64Img = await resizeBase64(base64ImgRaw, snappedW, snappedH);
            const maskBase64 = await resizeBase64(maskBase64Raw, snappedW, snappedH);

            // 3. API Call
            const enhancedPrompt = `${prompt}, photorealistic and extremely natural seamless extension, perfectly match the environment, textures, and lighting. Accurately continue and align all structural lines, floor patterns, stripes, and architectural details without any visible seams, borders, or artifacts.`;
            const resultUrl = await runwareInpaint(apiKey, base64Img, maskBase64, prompt, snappedW, snappedH);
            setResultImage(resultUrl);

            // Add to library
            addItem({
                url: resultUrl,
                originalUrl: image,
                tool: 'outpaint',
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
                setPreviewImage(event.target.result as string);
                setResultImage(null);
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
                        <Maximize size={20} />
                    </div>
                    <div className="app-header-info">
                        <h1>Outpaint (Rozszerzanie)</h1>
                        <p>Dorysuj brakujące tło i zmień proporcje zdjęcia</p>
                    </div>
                </div>

                <div className="app-header-right">
                    {resultImage && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => { setImage(null); setResultImage(null); }} className="lightbox-btn" style={{ height: '38px' }}>
                                <RefreshCw size={14} />
                                <span>Nowe Zdjęcie</span>
                            </button>
                            <a href={resultImage} download={`outpaint-${Date.now()}.png`} className="lightbox-btn primary" style={{ textDecoration: 'none', height: '38px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                    <ImageIcon size={32} />
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
                                <h3 className="tool-section-title" style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>Formatuj / Rozszerz</h3>

                                <div style={{ position: 'relative', width: '100%' }}>
                                    <button
                                        className="visual-card active"
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        style={{ marginBottom: '12px', border: '1px solid var(--accent)', background: 'rgba(14, 165, 233, 0.1)' }}
                                    >
                                        <div className="visual-card-graphic" style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)', background: 'rgba(14, 165, 233, 0.1)' }}>
                                            {aspectRatio === 'original' ? <ImageIcon size={20} /> : aspectRatio}
                                        </div>
                                        <div className="visual-card-info">
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                <span className="visual-card-name" style={{ fontSize: '13px' }}>{RATIOS.find(r => r.value === aspectRatio)?.label}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontSize: '9px', color: 'var(--accent)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>Rozwiń</span>
                                                    <span style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', fontSize: '10px' }}>▼</span>
                                                </div>
                                            </div>
                                            <span className="visual-card-desc" style={{ fontSize: '10px' }}>{RATIOS.find(r => r.value === aspectRatio)?.desc}</span>
                                        </div>
                                    </button>

                                    {isDropdownOpen && (
                                        <div className="visual-card-list" style={{
                                            position: 'absolute',
                                            top: 'calc(100% - 8px)',
                                            left: 0,
                                            right: 0,
                                            zIndex: 100,
                                            background: 'rgba(10, 10, 15, 0.98)',
                                            backdropFilter: 'blur(32px)',
                                            border: '1px solid var(--accent)',
                                            borderRadius: '16px',
                                            padding: '8px',
                                            boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(14, 165, 233, 0.2)'
                                        }}>
                                            {RATIOS.map((ratio) => (
                                                <button
                                                    key={ratio.value}
                                                    className={`visual-card ${aspectRatio === ratio.value ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setAspectRatio(ratio.value);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    style={{ border: 'none', background: aspectRatio === ratio.value ? 'rgba(14, 165, 233, 0.1)' : 'transparent', textAlign: 'left' }}
                                                >
                                                    <div className="visual-card-graphic" style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                        {ratio.value === 'original' ? <ImageIcon size={18} /> : ratio.value}
                                                    </div>
                                                    <div className="visual-card-info">
                                                        <span className="visual-card-name" style={{ fontSize: '13px' }}>{ratio.label}</span>
                                                        <span className="visual-card-desc" style={{ fontSize: '10px' }}>{ratio.desc}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginTop: 'auto' }}>
                                <button
                                    onClick={() => { setImage(null); setResultImage(null); setPreviewImage(null); }}
                                    className="lightbox-btn"
                                    style={{ width: '100%', justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)' }}
                                >
                                    Wgraj Nowe Zdjęcie
                                </button>
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="studio-main-content">
                            {/* Main Workspace Area */}
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', paddingBottom: '100px' }}>
                                <img
                                    src={resultImage || previewImage || image}
                                    alt="Preview"
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        display: 'block',
                                        borderRadius: '20px',
                                        boxShadow: '0 30px 60px rgba(0,0,0,0.6)'
                                    }}
                                />

                            </div>

                            {/* Floating Bottom Bar */}
                            <div className="studio-bottom-bar-floating">
                                <div className="studio-floating-input-group">
                                    <input
                                        type="text"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Co dorysować w tle? (np. 'góry w tle', 'nowoczesne biuro')..."
                                        className="studio-floating-input"
                                        onKeyDown={(e) => { if (e.key === 'Enter') generateOutpaint(); }}
                                    />
                                    <button
                                        onClick={generateOutpaint}
                                        disabled={isLoading || aspectRatio === 'original'}
                                        className="studio-floating-btn"
                                    >
                                        {isLoading ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
                                        <span>Rozszerz Obraz</span>
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
                message="Rozszerzenie zostało zapisane w bibliotece!"
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
                                        <span>Generowanie tła...</span>
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
