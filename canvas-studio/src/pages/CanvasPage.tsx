import React, { useCallback, Suspense, lazy } from 'react';
import LeftToolbar from '@/components/toolbar/LeftToolbar';
import AIChatPanel from '@/components/chat/AIChatPanel';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { Sparkles, Settings, Trash2 } from 'lucide-react';

const CanvasEditor = lazy(() => import('@/components/canvas/CanvasEditor'));

export default function CanvasPage() {
    const { addLayer, selectedLayerIds, removeLayer, layers, getNextPlacement, stageScale } = useCanvasStore();
    const { clearMessages, showSettings, setShowSettings } = useChatStore();

    const handleUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const src = e.target?.result as string;
            const img = new window.Image();
            img.onload = () => {
                const maxW = 700;
                const scale = img.width > maxW ? maxW / img.width : 1;
                const w = img.width * scale;
                const h = img.height * scale;

                const placement = getNextPlacement(w, h);

                addLayer({
                    type: 'image',
                    src,
                    x: placement.x,
                    y: placement.y,
                    width: placement.width,
                    height: placement.height,
                    rotation: 0,
                    name: file.name,
                    visible: true,
                    locked: false,
                });
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
    }, [addLayer, getNextPlacement]);

    const handleDelete = useCallback(() => {
        selectedLayerIds.forEach(id => removeLayer(id));
    }, [selectedLayerIds, removeLayer]);

    const handleDownload = useCallback(() => {
        const stage = (window as any).__konvaStage;
        if (stage) {
            const dataUrl = stage.toDataURL({ pixelRatio: 2 });
            const link = document.createElement('a');
            link.download = 'canvas-export.png';
            link.href = dataUrl;
            link.click();
        } else {
            const layer = layers.find((l) => selectedLayerIds.includes(l.id));
            if (layer?.src) {
                const link = document.createElement('a');
                link.download = layer.name || 'image.png';
                link.href = layer.src;
                link.click();
            }
        }
    }, [layers, selectedLayerIds]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--bg-primary)' }}>
            {/* The Top Header */}
            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-header-icon">
                        <Sparkles size={20} />
                    </div>
                    <div className="app-header-info">
                        <h1>Nano Banana</h1>
                        <p>Zaawansowany edytor wizualny AI</p>
                    </div>
                </div>

                <div className="app-header-right">
                    <button className="icon-btn" onClick={clearMessages} title="Wyczyść czat" style={{ border: '1px solid var(--border-strong)' }}>
                        <Trash2 size={18} />
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <main className="canvas-main">
                    <LeftToolbar
                        onUpload={handleUpload}
                        onDelete={handleDelete}
                        onDownload={handleDownload}
                    />
                    <Suspense fallback={<div className="canvas-loading">Loading editor...</div>}>
                        <CanvasEditor />
                    </Suspense>
                    {layers.length === 0 && (
                        <div className="canvas-empty-state">
                            <div className="canvas-empty-icon">🖼️</div>
                            <div className="canvas-empty-title">Twój canvas jest pusty</div>
                            <div className="canvas-empty-sub">
                                Przeciągnij obraz tutaj lub użyj przycisku ↑ Upload
                            </div>
                        </div>
                    )}
                </main>
                <aside className="chat-aside" style={{ borderTop: 'none', height: '100%' }}>
                    <AIChatPanel mode="canvas" />
                </aside>
            </div>
        </div>
    );
}
