import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Sun, Image as ImageIcon, Loader2, Download, RefreshCw, Library } from 'lucide-react';
import { runwareImageInference } from '@/lib/runware';
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

const LIGHTING_PRESETS = [
    {
        id: 'cinematic',
        name: 'Cinematic Studio',
        desc: 'Profesjonalne oświetlenie studyjne z mocnymi cieniami',
        prompt: 'cinematic studio lighting, dramatic shadows, key light from Top Right, professional photography, 8k resolution, highly detailed',
        icon: '🎬',
        thumbnail: '/relight_cinematic.png' // I will use the generated path later or standard gradient
    },
    {
        id: 'neon',
        name: 'Cyberpunk Neon',
        desc: 'Vibrantne róże i błękity w stylu futurystycznym',
        prompt: 'cyberpunk neon lighting, vibrant pink and teal rim lights, glowing environmental reflections, moody dark futuristic atmosphere',
        icon: '🔴',
        thumbnail: '/relight_neon.png'
    },
    {
        id: 'golden',
        name: 'Golden Hour',
        desc: 'Ciepłe, złote światło zachodzącego słońca',
        prompt: 'beautiful golden hour sunlight, warm glowing skin tones, long soft shadows, lens flare, sunset light, ethereal and magical',
        icon: '🌅',
        thumbnail: '/relight_golden.png'
    },
    {
        id: 'moonlight',
        name: 'Moonlight',
        desc: 'Zimne, niebieskie światło księżyca i głębokie cienie',
        prompt: 'cold blue moonlight, mystery, dark shadows, pale cinematic blue rim lighting, cinematic night scene',
        icon: '🌙',
        thumbnail: '/relight_moonlight.png'
    },
    {
        id: 'fire',
        name: 'Firelight',
        desc: 'Ciepły blask ogniska oświetlający twarz od dołu',
        prompt: 'warm flickering firelight from below, dramatic orange and red glow on face, deep contrast, campfire atmosphere',
        icon: '🔥',
        thumbnail: '/relight_fire.png'
    }
];

export default function RelightPage() {
    const { apiKeys } = useChatStore();
    const { addItem } = useLibraryStore();
    const [image, setImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
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
    const [selectedPreset, setSelectedPreset] = useState(LIGHTING_PRESETS[0]);
    const [selectedModel, setSelectedModel] = useState('google:4@2');
    const [customPrompt, setCustomPrompt] = useState("");
    const [strength, setStrength] = useState(0.2);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const [isNotificationVisible, setIsNotificationVisible] = useState(false);

    const AVAILABLE_MODELS = [
        { id: 'google:4@2', name: 'Nano Banana Pro', desc: 'Szybki i precyzyjny (Gemini)' },
        { id: 'runware:100@1', name: 'Flux.1 Dev', desc: 'Najwyższa jakość i detale' },
        { id: 'runware:1@1', name: 'SDXL 1.0', desc: 'Klasyczny fotorealizm' }
    ];

    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const generateRelight = async () => {
        if (!image) return;

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

            const base64Img = await toBase64(image);

            const finalPrompt = customPrompt.trim()
                ? `${selectedPreset.prompt}, ${customPrompt}`
                : selectedPreset.prompt;

            const masterPrompt = `[RELIGHTING TASK]
Maintain the EXACT facial features, bone structure, and identity of the person in the image.
Apply the following lighting effect: ${finalPrompt}.
Do not change the subject's appearance, just the lighting atmosphere.`;

            // Using standard image to image with low strength on a model supporting Img2Img natively
            const resultUrl = await runwareImageInference(
                apiKey,
                masterPrompt,
                base64Img,
                strength,
                img.naturalWidth,
                img.naturalHeight,
                selectedModel
            );

            setResultImage(resultUrl);

            // Add to library
            addItem({
                url: resultUrl,
                originalUrl: image,
                tool: 'relight',
                prompt: finalPrompt
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
                        <Sun size={20} />
                    </div>
                    <div className="app-header-info">
                        <h1>Relight (Zmień Światło)</h1>
                        <p>Zastosuj profesjonalne oświetlenie na swoim zdjęciu</p>
                    </div>
                </div>

                <div className="app-header-right">
                    {resultImage && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => { setImage(null); setResultImage(null); }} className="lightbox-btn" style={{ height: '38px' }}>
                                <RefreshCw size={14} />
                                <span>Nowe Zdjęcie</span>
                            </button>
                            <a href={resultImage} download={`relight-${Date.now()}.jpg`} className="lightbox-btn primary" style={{ textDecoration: 'none', height: '38px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Download size={14} />
                                <span>Pobierz JPG</span>
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
                                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Oświetlenie działa najlepiej na portretach i osobach</p>
                            </div>
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileUpload} />
                        </div>
                    </div>
                ) : (
                    <div className="studio-workspace">
                        {/* Floating Control Panel */}
                        <div className="studio-panel-floating">
                            <div>
                                <h3 className="tool-section-title" style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>Oświetlenie</h3>

                                <div style={{ position: 'relative', width: '100%', marginBottom: '24px' }}>
                                    <button
                                        className="visual-card active"
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        style={{ border: '1px solid var(--accent)', background: 'rgba(14, 165, 233, 0.1)' }}
                                    >
                                        <div className="visual-card-graphic" style={{ background: `linear-gradient(135deg, var(--bg-active), ${selectedPreset.id === 'neon' ? '#ff0080' : selectedPreset.id === 'golden' ? '#f59e0b' : selectedPreset.id === 'moonlight' ? '#3b82f6' : 'var(--accent)'})` }}>
                                            <span style={{ fontSize: '20px' }}>{selectedPreset.icon}</span>
                                        </div>
                                        <div className="visual-card-info">
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                <span className="visual-card-name" style={{ fontSize: '13px' }}>{selectedPreset.name}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontSize: '9px', color: 'var(--accent)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>Zmień</span>
                                                    <span style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', fontSize: '10px' }}>▼</span>
                                                </div>
                                            </div>
                                            <span className="visual-card-desc" style={{ fontSize: '10px' }}>{selectedPreset.desc}</span>
                                        </div>
                                    </button>

                                    {isDropdownOpen && (
                                        <div className="visual-card-list" style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            zIndex: 100,
                                            background: 'rgba(10, 10, 15, 0.98)',
                                            backdropFilter: 'blur(24px)',
                                            border: '1px solid var(--border-strong)',
                                            borderRadius: '16px',
                                            padding: '8px',
                                            marginTop: '4px',
                                            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
                                        }}>
                                            {LIGHTING_PRESETS.map((preset) => (
                                                <button
                                                    key={preset.id}
                                                    className={`visual-card ${selectedPreset.id === preset.id ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setSelectedPreset(preset);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    style={{ border: 'none', background: selectedPreset.id === preset.id ? 'rgba(14, 165, 233, 0.1)' : 'transparent', padding: '10px' }}
                                                >
                                                    <div className="visual-card-graphic" style={{ width: '40px', height: '40px', background: `linear-gradient(135deg, var(--bg-active), ${preset.id === 'neon' ? '#ff0080' : preset.id === 'golden' ? '#f59e0b' : preset.id === 'moonlight' ? '#3b82f6' : 'var(--accent)'})` }}>
                                                        <span style={{ fontSize: '16px' }}>{preset.icon}</span>
                                                    </div>
                                                    <div className="visual-card-info">
                                                        <span className="visual-card-name" style={{ fontSize: '13px' }}>{preset.name}</span>
                                                        <span className="visual-card-desc" style={{ fontSize: '10px' }}>{preset.desc}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <h3 className="tool-section-title" style={{ color: 'var(--text-muted)', marginBottom: '12px', marginTop: '24px' }}>Model AI</h3>
                                <div style={{ position: 'relative', width: '100%', marginBottom: '24px' }}>
                                    <button
                                        className="visual-card active"
                                        onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                        style={{ border: '1px solid var(--accent)', background: 'rgba(14, 165, 233, 0.1)' }}
                                    >
                                        <div className="visual-card-graphic" style={{ background: 'var(--bg-active)' }}>
                                            <Sparkles size={16} />
                                        </div>
                                        <div className="visual-card-info">
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                <span className="visual-card-name" style={{ fontSize: '13px' }}>
                                                    {AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontSize: '9px', color: 'var(--accent)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>Zmień</span>
                                                    <span style={{ transform: isModelDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', fontSize: '10px' }}>▼</span>
                                                </div>
                                            </div>
                                            <span className="visual-card-desc" style={{ fontSize: '10px' }}>
                                                {AVAILABLE_MODELS.find(m => m.id === selectedModel)?.desc}
                                            </span>
                                        </div>
                                    </button>

                                    {isModelDropdownOpen && (
                                        <div className="visual-card-list" style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            zIndex: 100,
                                            background: 'rgba(10, 10, 15, 0.98)',
                                            backdropFilter: 'blur(24px)',
                                            border: '1px solid var(--border-strong)',
                                            borderRadius: '16px',
                                            padding: '8px',
                                            marginTop: '4px',
                                            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
                                        }}>
                                            {AVAILABLE_MODELS.map((model) => (
                                                <button
                                                    key={model.id}
                                                    className={`visual-card ${selectedModel === model.id ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setSelectedModel(model.id);
                                                        setIsModelDropdownOpen(false);
                                                    }}
                                                    style={{ border: 'none', background: selectedModel === model.id ? 'rgba(14, 165, 233, 0.1)' : 'transparent', padding: '10px' }}
                                                >
                                                    <div className="visual-card-graphic" style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)' }}>
                                                        <Sparkles size={14} />
                                                    </div>
                                                    <div className="visual-card-info">
                                                        <span className="visual-card-name" style={{ fontSize: '13px' }}>{model.name}</span>
                                                        <span className="visual-card-desc" style={{ fontSize: '10px' }}>{model.desc}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="premium-slider-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                                    <div className="premium-slider-header">
                                        <span className="premium-slider-label">Intensywność</span>
                                        <span className="premium-slider-value">{Math.round(strength * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.2" max="0.7" step="0.05"
                                        value={strength}
                                        onChange={(e) => setStrength(parseFloat(e.target.value))}
                                        className="premium-range"
                                    />
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Siła oświetlenia i efektu.
                                    </p>
                                </div>
                            </div>

                            <div style={{ marginTop: 'auto' }}>
                                <button
                                    onClick={() => { setImage(null); setResultImage(null); }}
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
                                    ref={imageRef}
                                    src={resultImage || image}
                                    alt="Preview"
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        borderRadius: '20px',
                                        boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
                                        display: 'block'
                                    }}
                                />

                            </div>

                            {/* Floating Bottom Bar */}
                            <div className="studio-bottom-bar-floating">
                                <div className="studio-floating-input-group">
                                    <div style={{ flex: 1, position: 'relative' }}>
                                        <input
                                            type="text"
                                            value={customPrompt}
                                            onChange={(e) => setCustomPrompt(e.target.value)}
                                            placeholder="Modyfikatory (np. 'podświetl z lewej', 'dodaj mgłę')..."
                                            className="studio-floating-input"
                                            style={{ width: '100%' }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') generateRelight(); }}
                                        />
                                    </div>
                                    <button
                                        onClick={generateRelight}
                                        disabled={isLoading}
                                        className="studio-floating-btn"
                                    >
                                        {isLoading ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
                                        <span>Zastosuj Światło</span>
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
                message="Oświetlenie zostało zapisane w bibliotece!"
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
                                        <span>Zmiana oświetlenia...</span>
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
