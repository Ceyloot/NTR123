import React, { useState, useEffect } from 'react';
import StudioControls from '@/src/components/studio/StudioControls';
import { generatePhotoSelectedModel } from './StudioActions';
import { Download, Copy, Trash2, ImageOff } from 'lucide-react';
import '@/src/styles/studio/studio.css';

interface GeneratedImage {
    id: string;
    url: string;
    prompt: string;
    model: string;
    createdAt: number;
}

export default function StudioPage() {
    const [images, setImages] = useState<GeneratedImage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    // Load from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem('studio_images_v1');
        if (stored) {
            try {
                setImages(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse stored images");
            }
        }
    }, []);

    // Save to local storage when images change
    useEffect(() => {
        localStorage.setItem('studio_images_v1', JSON.stringify(images));
    }, [images]);

    const handleGenerate = async (prompt: string, model: any, aspectRatio: string, resolution: string, refImage: string | null) => {
        setIsGenerating(true);
        try {
            const res = await generatePhotoSelectedModel(prompt, model, aspectRatio, resolution, refImage || undefined);
            if (res.success && res.imageUrl) {
                const newImg: GeneratedImage = {
                    id: Date.now().toString(),
                    url: res.imageUrl,
                    prompt,
                    model,
                    createdAt: Date.now()
                };
                setImages(prev => [newImg, ...prev]);
            } else {
                alert(`Error: ${res.error}`);
            }
        } catch (error) {
            console.error(error);
            alert("An unexpected error occurred.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDelete = (id: string) => {
        setImages(prev => prev.filter(img => img.id !== id));
    };

    const handleCopy = async (url: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
            ]);
            alert("Skopiowano do schowka!");
        } catch (err) {
            console.error("Failed to copy image", err);
            // Fallback to copying URL
            navigator.clipboard.writeText(url);
            alert("Skopiowano link do schowka!");
        }
    };

    const handleDownload = async (url: string, id: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `studio-${id}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error("Failed to download", err);
            window.open(url, '_blank');
        }
    };

    const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

    // No empty pad slots logic needed.

    return (
        <main className="studio-main" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            {/* Header Area */}
            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-header-icon">
                        <SparklesIcon />
                    </div>
                    <div className="app-header-info">
                        <h1>Studio Zdjęć</h1>
                        <p>Generuj unikalne obrazy za pomocą AI</p>
                    </div>
                </div>
            </header>

            {/* Grid Area */}
            <div className="studio-grid-scroll-area">
                <div className="studio-gallery-grid">
                    {images.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gridColumn: '1 / -1', padding: '80px 20px', color: 'var(--text-muted)' }}>
                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', border: '1px dashed var(--border-strong)' }}>
                                <ImageOff size={32} style={{ opacity: 0.5 }} />
                            </div>
                            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Puste Studio</h2>
                            <p style={{ fontSize: '14px', maxWidth: '400px', textAlign: 'center', lineHeight: '1.6' }}>Tutaj pojawią się Twoje wygenerowane obrazy. Wpisz polecenie na dole ekranu by zacząć tworzyć nowe, niesamowite grafiki!</p>
                        </div>
                    ) : (
                        images.map((img) => (
                            <div key={img.id} className="studio-grid-item filled group" onClick={() => setSelectedImage(img)}>
                                <img src={img.url} alt={img.prompt} className="studio-image" />

                                {/* Overlay on hover */}
                                <div className="studio-item-overlay">
                                    <p className="item-prompt">{img.prompt}</p>
                                    <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => handleCopy(img.url)} title="Kopiuj"><Copy size={14} /></button>
                                        <button onClick={() => handleDownload(img.url, img.id)} title="Pobierz"><Download size={14} /></button>
                                        <button onClick={() => handleDelete(img.id)} className="delete-btn" title="Usuń"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="studio-bottom-panel">
                <StudioControls onGenerate={handleGenerate} isGenerating={isGenerating} />
            </div>

            {/* Lightbox / Fullscreen Image View */}
            {selectedImage && (
                <div
                    className="studio-lightbox animate-fade-in"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="lightbox-close" onClick={() => setSelectedImage(null)}>✕</button>
                        <img src={selectedImage.url} alt={selectedImage.prompt} className="lightbox-img" />
                        <div className="lightbox-info">
                            <p className="lightbox-prompt">{selectedImage.prompt}</p>
                            <div className="lightbox-actions">
                                <button className="lightbox-btn" onClick={() => handleCopy(selectedImage.url)}>
                                    <Copy size={16} /> Kopiuj
                                </button>
                                <button className="lightbox-btn primary" onClick={() => handleDownload(selectedImage.url, selectedImage.id)}>
                                    <Download size={16} /> Pobierz
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

function SparklesIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            <path d="M20 3v4" />
            <path d="M22 5h-4" />
            <path d="M4 17v2" />
            <path d="M5 18H3" />
        </svg>
    )
}
