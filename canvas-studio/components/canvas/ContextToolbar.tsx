'use client';

import React, { useState } from 'react';
import {
    Wand2, ArrowUpFromLine, Scissors, Shirt, Eraser,
    Layers, Type, MoreHorizontal, Download, ArrowLeftRight, Loader2,
    Bold, Italic, Palette, Square, Circle as CircleIcon, Scaling,
    Check, X, ChevronDown, AlignLeft, AlignCenter, AlignRight
} from 'lucide-react';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { geminiEditImage, geminiAnalyzeTextInImage, geminiGenerateMockupPrompt } from '@/lib/gemini';
import { runwareRemoveBackground, runwareUpscale, runwareMockup, runwareGenerateText, generateFramingMask, prepareOutpaintImages, snapToSupportedDimensions } from '@/lib/runware';

interface ContextToolbarProps {
    onAction?: (action: string) => void;
}

interface Action {
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    className?: string;
}

const IMAGE_ACTIONS: Action[] = [
    { id: 'upscale', label: 'Upscale', icon: <ArrowUpFromLine size={16} />, badge: 'HD' },
    { id: 'removeBg', label: 'Remove BG', icon: <Scissors size={16} /> },
    { id: 'remover', label: 'Remover', icon: <Eraser size={16} /> },
    { id: 'editTextAIBrush', label: 'Edit Text', icon: <Type size={16} />, badge: 'AI' },
];

const BRUSH_ACTIONS: Action[] = [
    { id: 'confirmBrush', label: 'Confirm', icon: <Check size={16} />, className: 'bg-blue-600 hover:bg-blue-700 text-white' },
    { id: 'select', label: 'Cancel', icon: <X size={16} /> },
];

const TEXT_ACTIONS: Action[] = [
    { id: 'editTextAI', label: 'Edit Text', icon: <Type size={16} />, badge: 'AI' },
];

const FONTS = [
    'Inter, sans-serif',
    'Roboto, sans-serif',
    'Playfair Display, serif',
    'Montserrat, sans-serif',
    'Courier New, monospace',
    'Fira Code, monospace'
];

export default function ContextToolbar({ onAction }: ContextToolbarProps) {
    const {
        selectedLayerIds, layers, updateLayer,
        activeTool, setActiveTool, clearPins, setPinMode,
        setTextEditorOpen, setTextAnalysis,
    } = useCanvasStore();
    const { apiKeys, addMessage, updateMessage } = useChatStore();
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    const selectedLayer = layers.find((l) => selectedLayerIds.includes(l.id));

    const handleAction = async (actionId: string) => {
        if (!selectedLayer) return;
        setLoadingAction(actionId);

        try {
            switch (actionId) {

                // ---- Remove Background ----
                case 'removeBg': {
                    if (!selectedLayer.src) throw new Error('Brak obrazu');
                    if (!apiKeys.runware) throw new Error('Brak klucza API Runware');

                    const msgId = addMessage({ role: 'system', content: '✂️ Usuwam tło...' });
                    const resultUrl = await runwareRemoveBackground(apiKeys.runware, selectedLayer.src);
                    updateLayer(selectedLayer.id, { src: resultUrl, originalSrc: selectedLayer.src });
                    updateMessage(msgId, { content: '✅ Tło usunięte!' });
                    break;
                }

                // ---- Upscale ----
                case 'upscale': {
                    if (!selectedLayer.src) throw new Error('Brak obrazu');
                    if (!apiKeys.runware) throw new Error('Brak klucza API Runware');

                    const msgId = addMessage({ role: 'system', content: '✨ Powiększam (4x)...' });
                    const resultUrl = await runwareUpscale(apiKeys.runware, selectedLayer.src);

                    // Attempt to adjust natural dimensions if possible
                    updateLayer(selectedLayer.id, {
                        src: resultUrl,
                        originalSrc: selectedLayer.src,
                    });
                    updateMessage(msgId, { content: '✅ Zdjęcie powiększone!' });
                    break;
                }



                // ---- Edit Text AI (Brush-based) ----
                case 'editTextAIBrush': {
                    if (!selectedLayer.src) throw new Error('Brak obrazu');
                    
                    setActiveTool('brush');
                    useCanvasStore.getState().setBrushMode('text-edit');
                    clearPins();
                    
                    addMessage({
                        role: 'system',
                        content: '✍️ **Edycja tekstu:** Zamaluj pędzlem tekst na zdjęciu, który chcesz zmienić, a następnie kliknij **Confirm**.'
                    });
                    break;
                }

                // ---- Remover (Magic Eraser) ----
                case 'remover': {
                    setActiveTool('brush');
                    clearPins();
                    addMessage({
                        role: 'system',
                        content: '🧽 **Pędzel:** Zamaluj obiekt, który chcesz usunąć, a następnie kliknij **Confirm**.'
                    });
                    break;
                }

                case 'confirmBrush': {
                    if (!selectedLayer?.src) return;
                    // We need to trigger the capture and removal in AIChatPanel
                    // For now, let's just trigger a custom event or shared state
                    (window as any).__canvasPulseBrushConfirm && (window as any).__canvasPulseBrushConfirm();
                    setActiveTool('select');
                    break;
                }



                // ---- Edit Text via Gemini (Legacy/Alternative) ----
                case 'editTextGemini': {
                    if (!selectedLayer.src) throw new Error('Brak obrazu');
                    if (!apiKeys.gemini) throw new Error('Brak klucza API Gemini');

                    const msgId = addMessage({ role: 'system', content: '🔍 Analizuję tekst na zdjęciu...' });
                    const analysis = await geminiAnalyzeTextInImage(apiKeys.gemini, selectedLayer.src);

                    setTextAnalysis(analysis);
                    setTextEditorOpen(true);

                    updateMessage(msgId, { content: `✍️ **Analiza tekstu ukończona.** Postaw pinezkę na zdjęciu i wpisz nową treść w oknie edytora.` });

                    clearPins();
                    setActiveTool('pin');
                    break;
                }



                // ---- Download ----
                case 'download': {
                    if (selectedLayer.src) {
                        const link = document.createElement('a');
                        link.download = selectedLayer.name || 'image.png';
                        link.href = selectedLayer.src;
                        link.click();
                    }
                    break;
                }
                
                // ---- Cancel/Tool Reset ----
                case 'select': {
                    setActiveTool('select');
                    clearPins();
                    break;
                }

                default:
                    onAction?.(actionId);
            }
        } catch (err) {
            addMessage({
                role: 'system',
                content: `❌ Błąd (${actionId}): ${err instanceof Error ? err.message : 'Nieznany błąd'}`,
            });
        } finally {
            setLoadingAction(null);
        }
    };

    const actions = activeTool === 'brush' ? BRUSH_ACTIONS : (selectedLayer?.type === 'image' ? IMAGE_ACTIONS : TEXT_ACTIONS);

    return (
        <div className="flex items-center gap-1.5 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200 backdrop-blur-md">
            {actions.map((action) => (
                <button
                    key={action.id}
                    onClick={() => handleAction(action.id)}
                    disabled={loadingAction !== null && loadingAction === action.id}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all rounded-lg ${
                        action.className || 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                    }`}
                >
                    {loadingAction === action.id ? <Loader2 size={16} className="animate-spin" /> : action.icon}
                    {action.label}
                    {action.badge && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-blue-500 rounded uppercase tracking-wider">
                            {action.badge}
                        </span>
                    )}
                </button>
            ))}
            <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
            <button 
                className="flex items-center justify-center w-10 h-10 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors" 
                title="Usuń" 
                onClick={() => selectedLayerIds.forEach(id => useCanvasStore.getState().removeLayer(id))}
            >
                <Eraser size={18} />
            </button>
        </div>
    );
}
