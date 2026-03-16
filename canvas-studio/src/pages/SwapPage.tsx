import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Users, Upload, ArrowRightLeft, Image as ImageIcon, Pin, Loader2, Download, Copy, RefreshCw } from 'lucide-react';
import { getAutomatedSubjectMask } from '@/lib/segmentation';
import { runwareCharacterSwap } from '@/lib/runware';
import { useChatStore } from '@/store/chatStore';
import { IDENTITY_TRANSFER_TEMPLATE } from '@/lib/prompts/swap';
import { geminiEnhanceSwapPrompt } from '@/lib/gemini';
import { expandMaskToBottom } from '@/lib/image-utils';

export default function SwapPage() {
    const { apiKeys } = useChatStore();
    const [baseImage, setBaseImage] = useState<string | null>(null);
    const [refImage, setRefImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [swaps, setSwaps] = useState<{ id: string; url: string; base: string; ref: string; timestamp: number }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'analyzing' | 'generating' | 'finishing'>('idle');
    const [timer, setTimer] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [showComparison, setShowComparison] = useState(true);
    const [selectedSwap, setSelectedSwap] = useState<{ url: string; base: string; ref: string } | null>(null);

    const sourceInputRef = useRef<HTMLInputElement>(null);
    const targetInputRef = useRef<HTMLInputElement>(null);
    const baseImgRef = useRef<HTMLImageElement>(null);

    // Load swaps from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('character_swaps');
        if (saved) {
            try {
                setSwaps(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse saved swaps", e);
            }
        }
    }, []);

    // Save swaps to localStorage
    useEffect(() => {
        if (swaps.length > 0) {
            localStorage.setItem('character_swaps', JSON.stringify(swaps));
        } else {
            localStorage.removeItem('character_swaps');
        }
    }, [swaps]);

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

    // Transition from analyzing to generating at 10s
    useEffect(() => {
        if (isLoading && timer >= 10 && status === 'analyzing') {
            setStatus('generating');
        }
    }, [timer, isLoading, status]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string | null>>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setter(event.target.result as string);
                if (setter === setBaseImage) {
                    setResultImage(null);
                    setError(null);
                }
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSwap = async () => {
        if (!baseImage || !refImage) {
            setError("Wgraj oba zdjęcia, aby kontynuować!");
            return;
        }

        const runwareKey = apiKeys.runware || import.meta.env.VITE_RUNWARE_API_KEY;
        const geminiKey = apiKeys.gemini;

        if (!runwareKey) {
            setError("Brak klucza API Runware. Dodaj go w ustawieniach.");
            return;
        }
        if (!geminiKey) {
            setError("Proszę dodać klucz API Gemini w ustawieniach czatu, aby umożliwić inteligentną analizę zdjęć.");
            return;
        }

        setIsLoading(true);
        setStatus('analyzing');
        setError(null);

        try {
            // 1. Generate Automated Mask from Target Scene
            let maskBase64 = await getAutomatedSubjectMask(baseImage);

            // 2. Gemini Analysis & Prompt Enhancement
            const enhancedPrompt = await geminiEnhanceSwapPrompt(
                geminiKey,
                "Character swap", // Default user intent
                refImage,
                baseImage,
                `VARIANT: local`,
                'local'
            );

            // 3. Wrap in IDENTITY_TRANSFER_TEMPLATE
            const finalSwapPrompt = IDENTITY_TRANSFER_TEMPLATE(enhancedPrompt, 'local');
            setStatus('generating');

            // 4. Calculate Dimensions & Perform Swap
            const getDimensions = (): Promise<{ width: number; height: number }> => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                    img.src = baseImage;
                });
            };

            const dims = await getDimensions();
            const buckets = [
                { w: 1024, h: 1024, r: 1 },    { w: 1280, h: 832, r: 1.5 },  
                { w: 832, h: 1280, r: 0.67 }, { w: 1216, h: 896, r: 1.33 }, 
                { w: 896, h: 1216, r: 0.75 }, { w: 1152, h: 960, r: 1.2 }, 
                { w: 960, h: 1152, r: 0.8 },  { w: 1344, h: 768, r: 1.78 }, 
                { w: 768, h: 1344, r: 0.56 }, { w: 1536, h: 640, r: 2.4 },
            ];

            const targetRatio = dims.width / dims.height;
            const bestBucket = buckets.reduce((prev, curr) =>
                Math.abs(curr.r - targetRatio) < Math.abs(prev.r - targetRatio) ? curr : prev
            );

            const multiplier = 2;
            const finalWidth = bestBucket.w * multiplier;
            const finalHeight = bestBucket.h * multiplier;

            const { imageUrl } = await runwareCharacterSwap(
                runwareKey,
                refImage,
                baseImage,
                maskBase64,
                "Source identity blueprint",
                "Target scene and pose",
                finalSwapPrompt,
                'local',
                finalWidth,
                finalHeight,
                "4K"
            );

            setStatus('finishing');
            setResultImage(imageUrl);

            const newSwap = {
                id: Math.random().toString(36).substr(2, 9),
                url: imageUrl,
                base: baseImage,
                ref: refImage,
                timestamp: Date.now()
            };
            setSwaps(prev => [newSwap, ...prev]);

        } catch (err: any) {
            console.error("Swap failed:", err);
            setError(err.message || "Wystąpił błąd podczas zamiany postaci.");
        } finally {
            setIsLoading(false);
            setStatus('idle');
        }
    };

    const deleteSwap = (id: string) => {
        const updated = swaps.filter(s => s.id !== id);
        setSwaps(updated);
        localStorage.setItem('character_swaps', JSON.stringify(updated));
        if (resultImage && swaps.find(s => s.id === id)?.url === resultImage) {
            setResultImage(null);
        }
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
                        <Users size={20} />
                    </div>
                    <div className="app-header-info">
                        <h1>Character Swap</h1>
                        <p>Magiczna zamiana postaci z zachowaniem sceny</p>
                    </div>
                </div>

                <div className="app-header-right">
                    {resultImage && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => {
                                    setBaseImage(null);
                                    setRefImage(null);
                                    setResultImage(null);
                                }}
                                className="lightbox-btn"
                                style={{ height: '38px' }}
                            >
                                <RefreshCw size={14} />
                                <span>Nowy Swap</span>
                            </button>
                            <a href={resultImage} download={`swap-${Date.now()}.jpg`} className="lightbox-btn primary" style={{ textDecoration: 'none', height: '38px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Download size={14} />
                                <span>Pobierz Wynik</span>
                            </a>
                        </div>
                    )}
                </div>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '40px' }}>

                {!resultImage ? (
                    <>
                        <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'stretch', gap: '24px', width: '100%', maxWidth: '1000px' }}>

                            {/* Reference Image Dropzone (NOW LEFT) */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div
                                    onClick={() => !refImage && targetInputRef.current?.click()}
                                    style={{
                                        flex: 1,
                                        background: 'rgba(18, 18, 28, 0.4)',
                                        border: refImage ? '1px solid var(--border-strong)' : '2px dashed var(--border)',
                                        borderRadius: '20px',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        cursor: refImage ? 'default' : 'pointer',
                                        minHeight: '400px',
                                        transition: 'all 0.3s'
                                    }}
                                >
                                    {refImage ? (
                                        <>
                                            <img src={refImage} alt="Reference face" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setRefImage(null); }}
                                                style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', padding: '6px', borderRadius: '50%', cursor: 'pointer' }}
                                            >
                                                ✕
                                            </button>
                                        </>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                                            <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', marginBottom: '16px' }}>
                                                <ImageIcon size={28} />
                                            </div>
                                            <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Twoje Zdjęcie (Twarz/Tożsamość)</h3>
                                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>Wgraj zdjęcie ze swoją twarzą / tożsamością</p>
                                        </div>
                                    )}
                                    <input type="file" ref={targetInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, setRefImage)} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <button 
                                    onClick={() => {
                                        const temp = baseImage;
                                        setBaseImage(refImage);
                                        setRefImage(temp);
                                    }}
                                    className="p-3 rounded-full bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700 text-zinc-400 hover:text-white transition-all transform hover:rotate-180"
                                    title="Zamień zdjęcia"
                                >
                                    <ArrowRightLeft size={24} />
                                </button>
                            </div>

                            {/* Base Image Dropzone (NOW RIGHT - SCENE) */}
                            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div
                                    onClick={() => !baseImage && sourceInputRef.current?.click()}
                                    className="group"
                                    style={{
                                        flex: 1,
                                        background: 'rgba(18, 18, 28, 0.4)',
                                        border: baseImage ? '1px solid var(--border-strong)' : '2px dashed var(--border)',
                                        borderRadius: '20px',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        cursor: baseImage ? 'default' : 'pointer',
                                        minHeight: '400px',
                                        transition: 'all 0.3s'
                                    }}
                                >
                                    {baseImage ? (
                                        <>
                                            <img ref={baseImgRef} src={baseImage} alt="Base Scene" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', padding: '6px 16px', borderRadius: '20px', color: '#fff', fontSize: '11px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                ✨ Postać zostanie wykryta automatycznie
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setBaseImage(null); }}
                                                style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', padding: '6px', borderRadius: '50%', cursor: 'pointer' }}
                                            >
                                                ✕
                                            </button>
                                        </>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                                            <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', marginBottom: '16px' }}>
                                                <Upload size={28} />
                                            </div>
                                            <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Zdjęcie Docelowe (Scena/Poza)</h3>
                                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>Wgraj scenerię / pozę, do której się dostosujesz</p>
                                        </div>
                                    )}
                                    <input type="file" ref={sourceInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, setBaseImage)} />
                                </div>
                            </div>

                        </div>

                        {error && (
                            <div className="animate-shake" style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                {error}
                            </div>
                        )}

                        <div style={{ width: '100%', maxWidth: '1000px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <button
                                className="studio-generate-btn"
                                onClick={handleSwap}
                                disabled={!baseImage || !refImage || isLoading}
                                style={{ padding: '14px 48px', fontSize: '15px' }}
                            >
                                <Sparkles size={18} />
                                <span>Generuj Character Swap</span>
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="animate-in fade-in zoom-in-95 duration-500" style={{ width: '100%', maxWidth: '1000px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <button
                                onClick={() => setShowComparison(true)}
                                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: showComparison ? 'var(--accent)' : 'transparent', color: showComparison ? '#fff' : 'var(--text-muted)', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                                Porównanie
                            </button>
                            <button
                                onClick={() => setShowComparison(false)}
                                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: !showComparison ? 'var(--accent)' : 'transparent', color: !showComparison ? '#fff' : 'var(--text-muted)', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                                Wynik (Solo)
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '20px', width: '100%', justifyContent: 'center' }}>
                            {showComparison && (
                                <div style={{ flex: 1, position: 'relative', borderRadius: '24px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', maxWidth: '480px' }}>
                                    <img src={baseImage || ''} alt="Before" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: '12px', fontSize: '10px', color: '#fff', backdropFilter: 'blur(4px)' }}>ORYGINAŁ</div>
                                </div>
                            )}
                            <div
                                onClick={() => setSelectedSwap({ url: resultImage!, base: baseImage!, ref: refImage! })}
                                style={{
                                    flex: 1,
                                    position: 'relative',
                                    borderRadius: '24px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border-strong)',
                                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                    background: 'var(--bg-tertiary)',
                                    maxWidth: showComparison ? '480px' : '800px',
                                    cursor: 'zoom-in'
                                }}
                            >
                                <img src={resultImage} alt="Swap Result" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />
                                <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'var(--accent)', padding: '4px 12px', borderRadius: '12px', fontSize: '10px', color: '#fff', backdropFilter: 'blur(4px)', boxShadow: '0 0 10px var(--accent-glow)' }}>WYNIK SWAP</div>
                                <div className="lightbox-hover-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', opacity: 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)' }}>
                                        <Sparkles size={24} color="white" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sparkles size={14} className="text-accent" />
                            <span>Postać została pomyślnie zamieniona</span>
                        </div>
                    </div>
                )}

                {/* History Section */}
                {swaps.length > 0 && (
                    <div style={{ width: '100%', maxWidth: '1000px', borderTop: '1px solid var(--border)', paddingTop: '40px', marginTop: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <RefreshCw size={16} className="text-accent" />
                                Ostatnie Swapy
                            </h2>
                            <button
                                onClick={() => { if (confirm("Wyczyścić historię swapów?")) { setSwaps([]); localStorage.removeItem('character_swaps'); } }}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
                            >
                                Wyczyść wszystko
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '20px' }}>
                            {swaps.map((swap) => (
                                <div
                                    key={swap.id}
                                    className="studio-img-card"
                                    onClick={() => {
                                        setSelectedSwap({ url: swap.url, base: swap.base, ref: swap.ref });
                                    }}
                                    style={{ height: '220px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
                                >
                                    <img src={swap.url} alt="Recent swap" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteSwap(swap.id); }}
                                        className="action-btn"
                                        style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', color: '#fff' }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Progress Overlay */}
                {isLoading && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                        <div style={{ width: '100%', maxWidth: '400px' }}>
                            <div className="msg-loading-enhanced-container">
                                {/* Phase 1: Analysis */}
                                <div className={`msg-loading-enhanced ${status !== 'analyzing' ? 'completed' : ''}`}>
                                    <div className="msg-loading-header">
                                        {status !== 'analyzing' ? <Sparkles size={16} className="text-green-400" /> : <Loader2 size={16} className="spin" />}
                                        <span>{status !== 'analyzing' ? 'Zakończono analizę' : 'Analizowanie zdjęć (Gemini)...'}</span>
                                        <span className="timer-badge">{status !== 'analyzing' ? 'OK' : formatTime(timer)}</span>
                                    </div>
                                    <div className="progress-bar-container">
                                        <div className="progress-bar-fill" style={{ width: status !== 'analyzing' ? '100%' : `${Math.min(95, (timer / 15) * 100)}%`, backgroundColor: status !== 'analyzing' ? '#4ade80' : undefined }} />
                                    </div>
                                    <div className="executing-label">{status !== 'analyzing' ? 'ZAKOŃCZONO' : 'ANALYZING'}</div>
                                </div>

                                {/* Phase 2: Generation */}
                                {(status === 'generating' || status === 'finishing' || status === 'idle') && isLoading && (
                                    <div className="msg-loading-enhanced mt-3 animate-in fade-in slide-in-from-top-2 duration-500">
                                        <div className="msg-loading-header">
                                            {status === 'finishing' ? <Sparkles size={16} className="text-green-400" /> : <Loader2 size={16} className="spin" />}
                                            <span>Transferowanie tożsamości...</span>
                                            <span className="timer-badge">{status === 'finishing' ? 'Finalizacja' : 'W toku'}</span>
                                        </div>
                                        <div className="progress-bar-container">
                                            <div className="progress-bar-fill" style={{ width: status === 'finishing' ? '100%' : '60%', backgroundColor: status === 'finishing' ? '#ffb340' : undefined }} />
                                        </div>
                                        <div className="executing-label">{status === 'finishing' ? 'POBIERANIE WYNIKU...' : 'GENERATING'}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Lightbox / Fullscreen Image View */}
                {selectedSwap && (
                    <div
                        className="studio-lightbox animate-fade-in"
                        onClick={() => setSelectedSwap(null)}
                        style={{ cursor: 'zoom-out', zIndex: 1000 }}
                    >
                        <div className="lightbox-content" onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                            <button className="lightbox-close" onClick={() => setSelectedSwap(null)}>✕</button>
                            <img src={selectedSwap.url} alt="Swap Preview" className="lightbox-img" />
                            <div className="lightbox-info">
                                <div className="lightbox-actions" style={{ justifyContent: 'center', width: '100%' }}>
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
                                        img.src = selectedSwap.url;
                                    }}>
                                        <Copy size={16} /> Kopiuj
                                    </button>
                                    <a href={selectedSwap.url} download={`swap-${Date.now()}.jpg`} className="lightbox-btn primary" style={{ textDecoration: 'none' }}>
                                        <Download size={16} /> Pobierz
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
