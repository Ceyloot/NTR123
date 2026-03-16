import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Scissors, Upload, Image as ImageIcon, Loader2, Download, Copy, RefreshCw, Trash2, Library } from 'lucide-react';
import { runwareRemoveBackground } from '@/lib/runware';
import { useChatStore } from '@/store/chatStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useCanvasStore } from '@/store/canvasStore';
import Notification from '@/components/layout/Notification';

export default function RemoveBgPage() {
    const navigate = useNavigate();
    const { apiKeys } = useChatStore();
    const { addItem } = useLibraryStore();
    const { addLayer, getNextPlacement, selectLayers } = useCanvasStore();
    const [image, setImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [timer, setTimer] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [selectedDetail, setSelectedDetail] = useState<{ url: string; original: string } | null>(null);
    const [isNotificationVisible, setIsNotificationVisible] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setImage(event.target.result as string);
                setResultImage(null);
                setError(null);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveBg = async () => {
        if (!image) return;

        const apiKey = apiKeys.runware || import.meta.env.VITE_RUNWARE_API_KEY;
        if (!apiKey) {
            setError("Brak klucza API Runware. Dodaj go w ustawieniach czatu.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const imageUrl = await runwareRemoveBackground(apiKey, image);
            setResultImage(imageUrl);

            // Add to library
            addItem({
                url: imageUrl,
                originalUrl: image,
                tool: 'remove-bg',
                prompt: 'Background removal'
            });

            setIsNotificationVisible(true);

        } catch (err: unknown) {
            console.error("Removal failed:", err);
            setError(err instanceof Error ? err.message : "Wystąpił błąd podczas usuwania tła.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendToCanvas = () => {
        if (!resultImage) return;

        // Create a temporary image to get natural dimensions
        const img = new Image();
        img.onload = () => {
            const { x, y, width, height } = getNextPlacement(img.width, img.height);
            
            const layerId = addLayer({
                type: 'image',
                src: resultImage,
                x,
                y,
                width,
                height,
                naturalWidth: img.width,
                naturalHeight: img.height,
                rotation: 0,
                name: 'Wycięty obiekt',
                visible: true,
                locked: false
            });

            selectLayers([layerId]);
            navigate('/'); // Go back to studio/canvas
        };
        img.src = resultImage;
    };

    const formatTime = (s: number) => {
        const mm = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = (s % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    };

    return (
        <main className="canvas-main" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>

            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-header-icon">
                        <Scissors size={20} />
                    </div>
                    <div className="app-header-info">
                        <h1>Usuwanie Tła</h1>
                        <p>Automatyczne wycinanie tła za pomocą AI</p>
                    </div>
                </div>

                <div className="app-header-right">
                    {resultImage && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => {
                                    setImage(null);
                                    setResultImage(null);
                                }}
                                className="lightbox-btn"
                                style={{ height: '38px' }}
                            >
                                <RefreshCw size={14} />
                                <span>Nowe Zdjęcie</span>
                            </button>
                            <a href={resultImage} download={`no-bg-${Date.now()}.png`} className="lightbox-btn primary" style={{ textDecoration: 'none', height: '38px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                    <div className="visual-card active" style={{ background: 'rgba(14, 165, 233, 0.1)', cursor: 'default' }}>
                                        <div className="visual-card-graphic" style={{ width: '40px', height: '40px', background: 'rgba(59, 130, 246, 0.1)' }}>
                                            <Scissors size={18} className="text-accent" />
                                        </div>
                                        <div className="visual-card-info">
                                            <span className="visual-card-name" style={{ fontSize: '13px' }}>Usuwanie Tła</span>
                                            <span className="visual-card-desc" style={{ fontSize: '10px' }}>Automatyczne wycinanie</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '12px', fontSize: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                    {error}
                                </div>
                            )}

                            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button
                                    onClick={handleRemoveBg}
                                    disabled={isLoading || !!resultImage}
                                    className="studio-floating-btn"
                                    style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
                                >
                                    {isLoading ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
                                    <span>Usuń Tło</span>
                                </button>
                                {resultImage && (
                                    <button
                                        onClick={handleSendToCanvas}
                                        className="studio-floating-btn"
                                        style={{ width: '100%', padding: '12px', justifyContent: 'center', background: 'var(--accent-glow)', border: '1px solid var(--accent)' }}
                                    >
                                        <Library size={18} />
                                        <span>Wstaw na płótno</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => { setImage(null); setResultImage(null); setError(null); }}
                                    className="lightbox-btn"
                                    style={{ width: '100%', justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)' }}
                                >
                                    Wgraj Nowe
                                </button>
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="studio-main-content">
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                                <div style={{
                                    position: 'relative',
                                    borderRadius: '24px',
                                    overflow: 'hidden',
                                    boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
                                    background: resultImage ? 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGth2H/G0BAjB0G7Bn6QP7G9xS9YMTvDDAAx7QNS77Xh58AAAAASUVORK5CYII=") repeat' : 'transparent'
                                }}>
                                    <img
                                        src={resultImage || image}
                                        alt="Preview"
                                        style={{ maxWidth: '100%', maxHeight: '65vh', display: 'block' }}
                                    />


                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Lightbox */}
            {selectedDetail && (
                <div
                    className="studio-lightbox animate-fade-in"
                    onClick={() => setSelectedDetail(null)}
                    style={{ zIndex: 1000, background: 'rgba(0,0,0,0.92)' }}
                >
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setSelectedDetail(null)}>✕</button>
                        <div style={{ position: 'relative', background: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGth2H/G0BAjB0G7Bn6QP7G9xS9YMTvDDAAx7QNS77Xh58AAAAASUVORK5CYII=") repeat' }}>
                            <img src={selectedDetail.url} alt="Full result" className="lightbox-img" style={{ maxHeight: '75vh' }} />
                        </div>
                        <div className="lightbox-info">
                            <div className="lightbox-actions" style={{ marginLeft: 'auto' }}>
                                <button className="lightbox-btn" onClick={() => {
                                    const canvas = document.createElement('canvas');
                                    const img = new Image();
                                    img.crossOrigin = "anonymous";
                                    img.onload = () => {
                                        canvas.width = img.width;
                                        canvas.height = img.height;
                                        const ctx = canvas.getContext('2d');
                                        ctx?.drawImage(img, 0, 0);
                                        canvas.toBlob((blob) => {
                                            if (blob) {
                                                const item = new ClipboardItem({ "image/png": blob });
                                                navigator.clipboard.write([item]);
                                                alert("Skopiowano do schowka!");
                                            }
                                        });
                                    };
                                    img.src = selectedDetail.url;
                                }}>
                                    <Copy size={16} /> Kopiuj
                                </button>
                                <a href={selectedDetail.url} download={`remove-bg-${Date.now()}.png`} className="lightbox-btn primary" style={{ textDecoration: 'none' }}>
                                    <Download size={16} /> Pobierz PNG
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Notification
                message="Zdjęcie zostało zapisane w bibliotece!"
                isVisible={isNotificationVisible}
                onClose={() => setIsNotificationVisible(false)}
            />
        </main>
    );
}
