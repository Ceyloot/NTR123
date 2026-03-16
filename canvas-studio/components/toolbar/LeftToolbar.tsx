'use client';

import React from 'react';
import {
    MousePointer2, Pencil, Type, ZoomIn, ZoomOut,
    Upload, Trash2, Download, Pin, ArrowUpFromLine, Scissors
} from 'lucide-react';
import { useCanvasStore, ToolType } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';

interface Tool {
    id: ToolType;
    icon: React.ReactNode;
    label: string;
    shortcut?: string;
}

const TOOLS: Tool[] = [
    { id: 'select', icon: <MousePointer2 size={18} />, label: 'Zaznacz i Przesuń', shortcut: 'V' },
    { id: 'brush', icon: <Pencil size={18} />, label: 'Remover (Magic Eraser)', shortcut: 'B' },
    { id: 'pin', icon: <Pin size={18} />, label: 'Pinezka (K)', shortcut: 'K' },
];

interface LeftToolbarProps {
    onUpload: (file: File) => void;
    onDelete: () => void;
    onDownload: () => void;
}

export default function LeftToolbar({ onUpload, onDelete, onDownload }: LeftToolbarProps) {
    const { 
        activeTool, setActiveTool, stageScale, setStageScale, 
        selectedLayerIds, layers, removeLayer, updateLayer 
    } = useCanvasStore();
    const { apiKeys, addMessage, updateMessage } = useChatStore();

    const selectedLayer = layers.find(l => selectedLayerIds.includes(l.id));

    const handleAction = async (action: string) => {
        if (!selectedLayer || !selectedLayer.src) {
            return addMessage({ role: 'system', content: 'ℹ️ Wybierz obraz, aby użyć tej funkcji.' });
        }

        if (action === 'editTextAI') {
            setActiveTool('brush');
            useCanvasStore.getState().setBrushMode('text-edit');
            
            addMessage({
                role: 'system',
                content: '✍️ **Edycja tekstu:** Zamaluj pędzlem tekst na zdjęciu, który chcesz zmienić, a następnie kliknij **Confirm**.'
            });
            return;
        }

        if (action === 'upscale') {
            if (!apiKeys.runware) return addMessage({ role: 'system', content: '❌ Brak klucza API Runware' });
            const msgId = addMessage({ role: 'system', content: '🚀 Upscaling 4x (Ultra HD)...' });
            try {
                const { runwareUpscale } = await import('@/lib/runware');
                const resultUrl = await runwareUpscale(apiKeys.runware, selectedLayer.src, 4);
                updateLayer(selectedLayer.id, { src: resultUrl, originalSrc: selectedLayer.src });
                updateMessage(msgId, { content: '✅ Zdjęcie powiększone!' });
            } catch (err: any) {
                updateMessage(msgId, { content: `❌ Błąd: ${err.message}` });
            }
        }

        if (action === 'removeBg') {
            if (!apiKeys.runware) return addMessage({ role: 'system', content: '❌ Brak klucza API Runware' });
            const msgId = addMessage({ role: 'system', content: '✂️ Usuwam tło...' });
            try {
                const { runwareRemoveBackground } = await import('@/lib/runware');
                const resultUrl = await runwareRemoveBackground(apiKeys.runware, selectedLayer.src);
                updateLayer(selectedLayer.id, { src: resultUrl, originalSrc: selectedLayer.src });
                updateMessage(msgId, { content: '✅ Tło usunięte!' });
            } catch (err: any) {
                updateMessage(msgId, { content: `❌ Błąd: ${err.message}` });
            }
        }
    };

    const handleUploadClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) {
                Array.from(files).forEach((f) => onUpload(f));
            }
        };
        input.click();
    };

    return (
        <div className="floating-toolbar">
            <div className="toolbar-tools">
                {TOOLS.map((tool) => (
                    <button
                        key={tool.id}
                        className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                        onClick={() => setActiveTool(tool.id)}
                        title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
                    >
                        {tool.icon}
                    </button>
                ))}
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-tools flex-col gap-2">
                <button 
                    className={`tool-btn ${!selectedLayer ? 'opacity-30' : ''}`} 
                    onClick={() => handleAction('editTextAI')} 
                    title="Edit Text AI"
                >
                    <Type size={18} />
                </button>
                <button 
                    className={`tool-btn ${!selectedLayer ? 'opacity-30' : ''}`} 
                    onClick={() => handleAction('upscale')} 
                    title="Upscale HD"
                >
                    <ArrowUpFromLine size={18} />
                </button>
                <button 
                    className={`tool-btn ${!selectedLayer ? 'opacity-30' : ''}`} 
                    onClick={() => handleAction('removeBg')} 
                    title="Remove Background"
                >
                    <Scissors size={18} />
                </button>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-tools">
                <button className="tool-btn" onClick={() => setStageScale(stageScale * 1.25)} title="Zoom In">
                    <ZoomIn size={18} />
                </button>
                <button className="tool-btn" onClick={() => setStageScale(stageScale / 1.25)} title="Zoom Out">
                    <ZoomOut size={18} />
                </button>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-tools">
                <button className="tool-btn upload-btn" onClick={handleUploadClick} title="Wgraj obraz">
                    <Upload size={18} />
                </button>
                <button className="tool-btn delete-btn" onClick={() => selectedLayerIds.forEach(id => removeLayer(id))} title="Usuń zaznaczone">
                    <Trash2 size={18} />
                </button>
                <button className="tool-btn" onClick={onDownload} title="Pobierz obraz">
                    <Download size={18} />
                </button>
            </div>
        </div>
    );
}
