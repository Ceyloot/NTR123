import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Users, Upload, ArrowRightLeft, Image as ImageIcon, Loader2, Download, RefreshCw, User, UserPlus } from 'lucide-react';
import { getAutomatedSubjectMask } from '@/lib/segmentation';
import { runwareCharacterFusion } from '@/lib/runware';
import { useChatStore } from '@/store/chatStore';
import { expandMaskToBottom, surgicalComposite, isMaskEmpty, createCenteredMaskFromSource } from '@/lib/image-utils';

export default function FusionPage() {
    const { apiKeys, swapVariant, setSwapVariant } = useChatStore();
    const [baseImage, setBaseImage] = useState<string | null>(null);
    const [refImage, setRefImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [userPrompt, setUserPrompt] = useState<string>('');
    const [swaps, setSwaps] = useState<{ id: string; url: string; base: string; ref: string; timestamp: number }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'analyzing' | 'generating'>('idle');
    const [timer, setTimer] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [showComparison, setShowComparison] = useState(true);

    const sourceInputRef = useRef<HTMLInputElement>(null);
    const targetInputRef = useRef<HTMLInputElement>(null);

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

    const handleFusion = async () => {
        if (!baseImage || !refImage) {
            setError("Wgraj obie fotografie, aby rozpocząć fuzję!");
            return;
        }

        const apiKey = apiKeys.runware || import.meta.env.VITE_RUNWARE_API_KEY;
        if (!apiKey) {
            setError("Brak klucza API Runware. Dodaj go w ustawieniach.");
            return;
        }

        setIsLoading(true);
        setStatus('analyzing');
        setError(null);
        try {
            // 1. Get natural dimensions from Scene Image (Right)
            const sceneImg = new Image();
            sceneImg.src = baseImage;
            await new Promise((r, rej) => { sceneImg.onload = r; sceneImg.onerror = rej; });
            const targetW = sceneImg.naturalWidth || 1024;
            const targetH = sceneImg.naturalHeight || 1024;

            // 2. Perform Detailed Identity Analysis via Gemini (Left Image)
            let identityTraits = "A highly detailed person with realistic skin texture and natural features.";
            try {
                const { geminiAnalyzeIdentity } = await import('@/lib/gemini');
                console.log("Starting Identity Analysis...");
                identityTraits = await geminiAnalyzeIdentity(apiKeys.gemini!, refImage);
            } catch (geminiErr) {
                console.warn("Gemini Identity Analysis failed (using fallback):", geminiErr);
            }

            // 3. Generate Automated Mask from Target Scene (Right)
            let maskBase64 = await getAutomatedSubjectMask(baseImage);

            // [FIX] If the mask is empty (no person in scene), get mask from Source and center it
            if (await isMaskEmpty(maskBase64)) {
                console.log("Target scene is empty. Generating centered mask from reference identity...");
                const sourceMask = await getAutomatedSubjectMask(refImage);
                maskBase64 = await createCenteredMaskFromSource(sourceMask, targetW, targetH);
            }

            // 4. Expand mask if full-body mode is active
            if (swapVariant === 'full-body') {
                maskBase64 = await expandMaskToBottom(maskBase64, targetW, targetH);
            }

            // 5. Combine User Prompt with Identity Anchor
            const combinedPrompt = userPrompt.trim() 
                ? `${userPrompt}. Maintain exactly: ${identityTraits}` 
                : `High-fidelity identity reconstruction. Traits: ${identityTraits}`;

            // 6. Perform Fusion with explicit dimensions and traits
            setStatus('generating');
            const { imageUrl } = await runwareCharacterFusion(
                apiKey,
                refImage, // Identity (Left)
                baseImage, // Scene (Right)
                maskBase64,
                combinedPrompt, 
                swapVariant,
                targetW,
                targetH,
                identityTraits // Also pass explicitly to template
            );

            // 7. Surgical Composite to blend the result back and restore resolution/aspect ratio
            const finalBlended = await surgicalComposite(baseImage, imageUrl, maskBase64, targetW, targetH);
            setResultImage(finalBlended);

        } catch (err: any) {
            console.error("Fusion error:", err);
            const errorMessage = err.message || String(err);
            if (errorMessage.includes("API key expired") || errorMessage.includes("400")) {
                setError("Błąd klucza Gemini: Twój klucz API wygasł lub jest nieprawidłowy. Zaktualizuj go w ustawieniach czatu.");
            } else {
                setError(`Błąd generowania: ${errorMessage}`);
            }
        } finally {
            setIsLoading(false);
            setStatus('idle');
        }
    };

    return (
        <main className="canvas-main" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>

            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-header-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        <Sparkles size={20} color="white" />
                    </div>
                    <div className="app-header-info">
                        <h1>Postać & Sceneria</h1>
                        <p>Zaawansowana fuzja postaci z nowym otoczeniem</p>
                    </div>
                </div>

                <div className="app-header-right">
                    {!resultImage && (
                        <div className="swap-mode-toggle" style={{ margin: 0, marginRight: '20px' }}>
                            <button
                                className={`mode-btn ${swapVariant === 'local' ? 'active' : ''}`}
                                onClick={() => setSwapVariant('local')}
                            >
                                <User size={14} />
                                <span>Obecne (Lokalne)</span>
                            </button>
                            <button
                                className={`mode-btn ${swapVariant === 'full-body' ? 'active' : ''}`}
                                onClick={() => setSwapVariant('full-body')}
                            >
                                <UserPlus size={14} />
                                <span>Drobienie postaci (Full)</span>
                            </button>
                        </div>
                    )}
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
                                <span>Nowa Fuzja</span>
                            </button>
                            <a href={resultImage} download={`fusion-${Date.now()}.jpg`} className="lightbox-btn primary" style={{ textDecoration: 'none', height: '38px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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

                            {/* Reference Image Dropzone */}
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
                                                <Users size={28} />
                                            </div>
                                            <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Twoja Postać</h3>
                                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>Wgraj postać, którą chcesz przenieść</p>
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
                                    className="p-3 rounded-full bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700 text-zinc-400 hover:text-white transition-all"
                                    title="Zamień zdjęcia"
                                >
                                    <ArrowRightLeft size={24} />
                                </button>
                            </div>

                            {/* Base Image Dropzone */}
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
                                            <img src={baseImage} alt="Base Scene" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', padding: '6px 16px', borderRadius: '20px', color: '#fff', fontSize: '11px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                🌌 Nowa sceneria i podkład
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
                                            <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Docelowa Sceneria</h3>
                                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>Wgraj zdjęcie, w którym chcesz się znaleźć</p>
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

                        <div style={{ width: '100%', maxWidth: '1000px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ width: '100%', background: 'rgba(18, 18, 28, 0.4)', borderRadius: '16px', border: '1px solid var(--border)', padding: '16px' }}>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Twój prompt / Kierunek artystyczny:</label>
                                <textarea 
                                    value={userPrompt}
                                    onChange={(e) => setUserPrompt(e.target.value)}
                                    placeholder="Opisz jak postać ma być wtopiona lub co ma robić (np. 'siedzi przy oknie', 'uśmiecha się')..."
                                    style={{
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-primary)',
                                        fontSize: '14px',
                                        resize: 'none',
                                        minHeight: '60px',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <button
                                className="studio-generate-btn"
                                onClick={handleFusion}
                                disabled={!baseImage || !refImage || isLoading}
                                style={{ padding: '14px 48px', fontSize: '15px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 10px 30px rgba(99, 102, 241, 0.3)' }}
                            >
                                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={18} />}
                                <span>Rozpocznij Fuzję Postaci</span>
                            </button>
                            
                            {isLoading && (
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ color: 'var(--text-primary)', fontWeight: '500', marginBottom: '4px' }}>
                                        {status === 'analyzing' ? 'Analizuję obie fotografie...' : 'Buduję nową tożsamość w scenerii...'}
                                    </p>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Czas operacji: {timer}s</p>
                                </div>
                            )}
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
                                    <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: '12px', fontSize: '10px', color: '#fff', backdropFilter: 'blur(4px)' }}>SCENERIA</div>
                                </div>
                            )}
                            <div
                                style={{
                                    flex: 1,
                                    position: 'relative',
                                    borderRadius: '24px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border-strong)',
                                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                    background: 'var(--bg-tertiary)',
                                    maxWidth: showComparison ? '480px' : '800px',
                                }}
                            >
                                <img src={resultImage} alt="Fusion Result" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />
                                <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '4px 12px', borderRadius: '12px', fontSize: '10px', color: '#fff', backdropFilter: 'blur(4px)', boxShadow: '0 0 15px rgba(99, 102, 241, 0.5)' }}>WYNIK FUZJI</div>
                            </div>
                        </div>

                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sparkles size={14} style={{ color: '#8b5cf6' }} />
                            <span>Postać została genialnie wtopiona w nową scenerię</span>
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}
