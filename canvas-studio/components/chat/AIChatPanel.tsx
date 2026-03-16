import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Send, Paperclip, Bot, User, Loader2, Trash2,
    Sparkles, Settings, X, Pin,
} from 'lucide-react';
import { useChatStore, ChatMessage } from '@/store/chatStore';
import { useCanvasStore, CanvasLayer, PinMarker } from '@/store/canvasStore';
import { runwareEditImage, runwareCharacterSwap, runwareInpaint, runwareRemoveBackground, snapToSupportedDimensions } from '@/lib/runware';
import { detectIntent } from '@/lib/ai';
import { stripDataUrl } from '@/lib/gemini'; // Added this import
import { INPAINT_PROMPT_TEMPLATE } from '@/lib/prompts/inpaint';
import { IDENTITY_TRANSFER_TEMPLATE } from '@/lib/prompts/swap';
import { getSmartMask } from '@/lib/segmentation';
import { expandMaskToBottom, surgicalComposite } from '@/lib/image-utils';

interface AIChatPanelProps {
    mode?: 'studio' | 'canvas' | 'swap' | 'inpaint' | 'outpaint' | 'relight' | 'remove-bg';
}

export default function AIChatPanel({ mode = 'canvas' }: AIChatPanelProps) {
    const {
        messages,
        addMessage,
        updateMessage,
        isLoading,
        setLoading,
        attachedImageUrl,
        setAttachedImage,
        apiKeys,
        setApiKey,
        showSettings,
        swapVariant,
        setSwapVariant
    } = useChatStore();

    const {
        layers, selectedLayerIds, updateLayer, addLayer,
        pins, clearPins,
        pinMode, getNextPlacement, stageScale
    } = useCanvasStore();

    const [input, setInput] = useState('');
    const [timer, setTimer] = useState(0);
    const [showModelSelector, setShowModelSelector] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modelSelectorRef = useRef<HTMLDivElement>(null);

    // Timeout Helper (increased to 180s for multi-AI operations)
    const withTimeout = <T,>(promise: Promise<T>, ms: number = 180000): Promise<T> => {
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Przekroczono czas oczekiwania (180s). Serwery Runware lub Gemini są mocno obciążone. Spróbuj ponownie.')), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
    };

    // Generation timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isLoading) {
            setTimer(0);
            interval = setInterval(() => setTimer((t) => t + 1), 1000);
        } else {
            setTimer(0);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle clicking outside model selector
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
                setShowModelSelector(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);    const models = [
        { id: 'google:4@2', name: 'Nano Banana Pro', desc: 'Fast & Efficient', icon: '🍌' },
        { id: 'runware:100@1', name: 'Turbo Gorilla Max', desc: 'High Quality & Detail', icon: '🦍' },
        { id: 'runware:101@1', name: 'Ultra Cheetah Ultra', desc: 'Extreme Speed', icon: '🐆' },
    ];

    const [selectedModel, setSelectedModel] = useState(models[0].id); // Store ID instead of Name

    // Helper to get name from ID
    const getModelName = (id: string) => models.find(m => m.id === id)?.name || id;

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const formatTime = (s: number) => {
        const mm = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = (s % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    };

    const selectedLayer = layers.find((l) => selectedLayerIds.includes(l.id));

    // Get a small crop around the pin area for the badge
    const getPinSnapshot = useCallback(async (layer: CanvasLayer, pin: PinMarker): Promise<string> => {
        return new Promise((resolve) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 64; // Small snapshot size
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d')!;

                // Calculate crop area in original image coordinates
                const sourceX = pin.normalizedX * img.naturalWidth - (size / (layer.width / img.naturalWidth)) / 2;
                const sourceY = pin.normalizedY * img.naturalHeight - (size / (layer.height / img.naturalHeight)) / 2;
                const sourceW = size * (img.naturalWidth / layer.width);
                const sourceH = size * (img.naturalHeight / layer.height);

                ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = layer.src || '';
        });
    }, []);

    const PinBadge = ({ pin, snapshot, index }: { pin: any, snapshot?: string, index?: number }) => (
        <div className="pin-badge-inline">
            <div className="pin-badge-img">
                {snapshot ? <img src={snapshot} alt="pin" /> : <Pin size={10} />}
            </div>
            {index !== undefined && <span className="pin-badge-num">{index + 1}</span>}
            <span className="pin-badge-text">{pin.description || 'Pinezka'}</span>
        </div>
    );

    // Convert an image src (URL or data URL) to base64 data URL
    const toBase64 = useCallback(async (src: string): Promise<string> => {
        if (src.startsWith('data:')) return src;
        // Load via canvas to convert URL to base64
        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Use natural dimensions for base64 conversion to avoid loss
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.95)); // High quality
            };
            img.onerror = reject;
            img.src = src;
        });
    }, []);

    // Helper to resize an image to specific dimensions matching Runware's expectations
    const resizeBase64 = useCallback(async (base64: string, targetWidth: number, targetHeight: number, mimeType: string = 'image/jpeg'): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                resolve(canvas.toDataURL(mimeType, 0.95));
            };
            img.onerror = () => reject(new Error('Nie udało się wczytać obrazka do skalowania.'));
            img.src = base64;
        });
    }, []);

    // Helper to crop an image around a point (used for isolating source objects)
    const cropAroundPoint = useCallback(async (base64: string, x: number, y: number, padding: number = 0.2): Promise<string> => {
        return new Promise((resolve) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Tighter crop (40% of small dimension instead of 80%) to avoid multiple objects
                const side = Math.min(img.width, img.height) * 0.4;
                const cropW = side;
                const cropH = side;

                const startX = Math.max(0, x - cropW / 2);
                const startY = Math.max(0, y - cropH / 2);

                canvas.width = 1024; // Standardize for Runware
                canvas.height = 1024;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, 1024, 1024);
                resolve(canvas.toDataURL('image/jpeg', 0.95));
            };
            img.src = base64;
        });
    }, []);

    // Prosta maska...
    const buildPinMask = useCallback(async (targetLayer: { src?: string; width: number; height: number }, localX: number, localY: number): Promise<string> => {
        const iw = targetLayer.width;
        const ih = targetLayer.height;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(iw);
        canvas.height = Math.round(ih);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Zgodnie z poleceniem: promień 150px
        const r = 150;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(localX, localY, r, 0, Math.PI * 2);
        ctx.fill();

        return canvas.toDataURL('image/png');
    }, []);

    const combineMasks = useCallback(async (mask1: string, mask2: string, w: number, h: number): Promise<string> => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            const img1 = new window.Image();
            const img2 = new window.Image();
            let loaded = 0;
            const onLoaded = () => {
                loaded++;
                if (loaded === 2) {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.drawImage(img1, 0, 0);
                    ctx.globalCompositeOperation = 'lighten'; // Combine white areas
                    ctx.drawImage(img2, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                }
            };
            img1.onload = onLoaded;
            img2.onload = onLoaded;
            img1.src = mask1;
            img2.src = mask2;
        });
    }, []);

    // Helper to restore original resolution after AI processing
    const restoreResolution = useCallback(async (resultSrc: string, naturalWidth: number, naturalHeight: number): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = naturalWidth;
                canvas.height = naturalHeight;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
                resolve(canvas.toDataURL('image/jpeg', 0.95));
            };
            img.onerror = () => reject(new Error('Nie udało się wczytać wygenerowanego obrazka do skalowania.'));
            img.src = resultSrc;
        });
    }, []);


    const featherMask = useCallback(async (maskSrc: string, w: number, h: number): Promise<string> => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                ctx.filter = 'blur(8px)';
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = maskSrc;
        });
    }, []);
    useEffect(() => {
        const handleBrushConfirm = async () => {
            const selectedLayer = layers.find(l => selectedLayerIds.includes(l.id));
            const brushMode = useCanvasStore.getState().brushMode;
            
            if (!selectedLayer || !selectedLayer.src || !apiKeys.runware || !apiKeys.gemini) return;

            const isTextEdit = brushMode === 'text-edit';
            const actionLabel = isTextEdit ? 'Edycja tekstu' : 'Magic Eraser';
            const msgId = addMessage({ role: 'system', content: `🧽 **${actionLabel}:** Przetwarzam zamalowany obszar...` });

            try {
                setLoading(true);

                // 1. Export the mask from CanvasEditor
                updateMessage(msgId, { content: '🖼️ Przechwytuję maskę...' });
                const maskUrl = await (window as any).__canvasExportBrushMask(selectedLayer.id);
                if (!maskUrl) throw new Error("Nie znaleziono maski do przetworzenia.");

                // 2. Identify the content using Gemini
                updateMessage(msgId, { content: isTextEdit ? '🔍 Analizuję tekst pod maską (Gemini)...' : '🔍 Analizuję obiekt pod maską (Gemini)...' });

                const { geminiAnalyzeBrushMask } = await import('@/lib/gemini');
                const promptText = isTextEdit 
                    ? "What is the EXACT text written in the white area of the mask? Return the text exactly as it appears. If multiple lines, separate with spaces. Return ONLY the text, nothing else."
                    : "What is the main object or element covered by the white area of the mask? Return ONLY the name of the object in English (e.g., 'car', 'person', 'trash can').";

                const detectedText = await geminiAnalyzeBrushMask(
                    apiKeys.gemini,
                    selectedLayer.src,
                    maskUrl,
                    promptText
                );

                if (isTextEdit) {
                    if (!detectedText || detectedText.toLowerCase().includes("no text")) {
                        throw new Error("Nie wykryto tekstu w zamalowanym obszarze.");
                    }
                    
                    updateMessage(msgId, { content: `✍️ Wykryto tekst: **"${detectedText}"**. Otwieram edytor...` });
                    
                    // Set text analysis for the modal
                    useCanvasStore.getState().setTextAnalysis(detectedText);
                    useCanvasStore.getState().setTextEditMask(maskUrl);
                    useCanvasStore.getState().setTextEditorOpen(true);
                } else {
                    const targetObj = detectedText.toLowerCase().replace(/['"]/g, '') || 'object';
                    updateMessage(msgId, { content: `🧽 Usuwam: **${targetObj}**...` });

                    // 3. Call Runware Inpaint (Remover)
                    const natW = selectedLayer.naturalWidth || selectedLayer.width;
                    const natH = selectedLayer.naturalHeight || selectedLayer.height;
                    const removalPrompt = `Professional photorealistic removal. Completely remove the ${targetObj} and fill the area with perfectly matching background textures, lighting, and patterns from the surrounding environment. No artifacts, no blurry spots, seamless integration.`;

                    const resultUrl = await withTimeout(runwareInpaint(
                        apiKeys.runware!,
                        selectedLayer.src,
                        maskUrl,
                        removalPrompt,
                        natW,
                        natH
                    ));

                    // 4. Update Layer
                    updateLayer(selectedLayer.id, {
                        src: resultUrl,
                        originalSrc: selectedLayer.src
                    });

                    updateMessage(msgId, { content: `✅ Obiekt (**${targetObj}**) pomyślnie usunięty!` });
                }
            } catch (err: any) {
                updateMessage(msgId, { content: `❌ Błąd: ${err.message}` });
            } finally {
                setLoading(false);
                useCanvasStore.getState().setBrushMode(null);
            }
        };

        (window as any).__canvasPulseBrushConfirm = handleBrushConfirm;
        return () => { (window as any).__canvasPulseBrushConfirm = null; };
    }, [layers, selectedLayerIds, apiKeys.runware, apiKeys.gemini]);

    useEffect(() => {
        const analyzeAndActOnPins = async () => {
            // Only find pins that aren't confirmed, haven't been analyzed (suggestions is undefined), and aren't CURRENTLY being analyzed
            const unanalyzedPin = pins.find(p => !p.confirmed && p.suggestions === undefined && !p.isAnalyzing);
            if (!unanalyzedPin || !apiKeys.gemini) return;

            const layer = layers.find(l => l.id === unanalyzedPin.layerId);
            if (!layer || !layer.src) return;

            // --- SUGGESTION ANALYSIS ONLY ---
            try {
                // Set flag to prevent simultaneous requests for same pin
                useCanvasStore.getState().updatePinAnalysisState(unanalyzedPin.id, true);

                const { geminiDetectPointObject } = await import('@/lib/gemini');
                const suggestions = await geminiDetectPointObject(
                    apiKeys.gemini,
                    layer.src,
                    unanalyzedPin.normalizedX,
                    unanalyzedPin.normalizedY
                );
                
                // Always update suggestions (even if empty) to mark as analyzed
                useCanvasStore.getState().updatePinSuggestions(unanalyzedPin.id, suggestions || []);
                if (suggestions && suggestions.length > 0) {
                    useCanvasStore.getState().updatePinDescription(unanalyzedPin.id, suggestions[0]);
                }
            } catch (e) {
                console.warn("Auto-analysis failed:", e);
                // Mark as analyzed even on failure to stop retry loops
                useCanvasStore.getState().updatePinSuggestions(unanalyzedPin.id, []);
            } finally {
                useCanvasStore.getState().updatePinAnalysisState(unanalyzedPin.id, false);
            }
        };

        analyzeAndActOnPins();
    }, [pins, layers, apiKeys.gemini, pinMode]);

    const handleSendMessage = async () => {
        const prompt = input.trim();
        if (!prompt && !attachedImageUrl) return;
        setInput('');
        setLoading(true);

        // Add user message with pin metadata
        const userPins = pins.length > 0 && selectedLayer ? await Promise.all(pins.map(async (p) => ({
            layerId: p.layerId,
            description: p.description,
            imageSnapshot: await getPinSnapshot(layers.find(l => l.id === p.layerId)!, p)
        }))) : undefined;

        addMessage({
            role: 'user',
            content: prompt,
            imageUrl: attachedImageUrl || undefined,
            pins: userPins
        });

        // Loading placeholder
        const loadingId = addMessage({
            role: 'assistant',
            content: '',
            isLoading: true,
            model: `🌟 ${getModelName(selectedModel)}`,
        });

        try {
            let resultUrl: string | undefined;
            let resultText: string | undefined;

            // ======= INTENT DETECTION =======
            const intent = detectIntent(prompt);
            const isSwapIntent = intent === 'transfer';
            const isRemoveBgIntent = intent === 'removeBackground';

            // Fetch result and apply timeout logic
            await withTimeout((async () => {
                // ======= CHARACTER SWAP LOGIC =======
                const hasSourceAndTarget = (pins.length >= 1 && attachedImageUrl) || (pins.length >= 2);

                if (isSwapIntent && hasSourceAndTarget) {
                    // --- SMART ROLE DETECTION ---
                    const promptLow = prompt.toLowerCase();
                    let targetLayer = layers.find(l => l.id === pins[0].layerId);
                    let sourceLayer = pins.length >= 2 ? layers.find(l => l.id === pins[1].layerId) : null;

                    // 1. Check for specific "source" indicators in pin descriptions
                    const sourceKeywords = ['ja', 'mnie', 'me', 'source', 'źródło', 'zdjęcie 1', 'zdjecie 1', 'photo 1'];
                    const targetKeywords = ['target', 'cel', 'miniaturka', 'scene', 'tło', 'zdjęcie 2', 'zdjecie 2', 'photo 2'];

                    const pin1IsSource = pins[0].description && sourceKeywords.some(kw => pins[0].description!.toLowerCase().includes(kw));
                    const pin2IsSource = pins.length >= 2 && pins[1].description && sourceKeywords.some(kw => pins[1].description!.toLowerCase().includes(kw));
                    const pin1IsTarget = pins[0].description && targetKeywords.some(kw => pins[0].description!.toLowerCase().includes(kw));
                    const pin2IsTarget = pins.length >= 2 && pins[1].description && targetKeywords.some(kw => pins[1].description!.toLowerCase().includes(kw));

                    if (pins.length >= 2) {
                        const swapMatch = promptLow.match(/(?:zamień|podmień|swap|replace)\s+(.*?)\s+(?:na|with|for)\s+(.*)/);
                        const insertMatch = promptLow.match(/(?:wstaw|wklej|insert)\s+(.*?)\s+(?:w miejsce|zamiast|jako)\s+(.*)/);

                        let detectedSourceIdx = -1;
                        let detectedTargetIdx = -1;

                        const thisKeywords = ['ta osoba', 'tą osobę', 'to', 'tego', 'ten', 'this', 'current', 'selected', 'morsa', 'mors'];

                        if (insertMatch) {
                            const firstPart = insertMatch[1].toLowerCase();
                            const secondPart = insertMatch[2].toLowerCase();
                            const pin1Desc = pins[0]?.description?.toLowerCase() || '';
                            const pin2Desc = pins[1]?.description?.toLowerCase() || '';
                            if (firstPart.includes('1') || firstPart.includes('pierwsz') || (pin1Desc.length > 2 && firstPart.includes(pin1Desc))) detectedSourceIdx = 0;
                            else if (firstPart.includes('2') || firstPart.includes('drug') || (pin2Desc.length > 2 && firstPart.includes(pin2Desc))) detectedSourceIdx = 1;
                            
                            if (secondPart.includes('1') || secondPart.includes('pierwsz') || (pin1Desc.length > 2 && secondPart.includes(pin1Desc)) || thisKeywords.some(kw => secondPart.includes(kw))) detectedTargetIdx = 0;
                            else if (secondPart.includes('2') || secondPart.includes('drug') || (pin2Desc.length > 2 && secondPart.includes(pin2Desc))) detectedTargetIdx = 1;
                        } else if (swapMatch) {
                            const firstPart = swapMatch[1].toLowerCase();
                            const secondPart = swapMatch[2].toLowerCase();
                            const pin1Desc = pins[0]?.description?.toLowerCase() || '';
                            const pin2Desc = pins[1]?.description?.toLowerCase() || '';
                            
                            if (firstPart.includes('1') || firstPart.includes('pierwsz') || (pin1Desc.length > 2 && firstPart.includes(pin1Desc)) || thisKeywords.some(kw => firstPart.includes(kw))) detectedTargetIdx = 0;
                            else if (firstPart.includes('2') || firstPart.includes('drug') || (pin2Desc.length > 2 && firstPart.includes(pin2Desc))) detectedTargetIdx = 1;
                            
                            if (secondPart.includes('1') || secondPart.includes('pierwsz') || (pin1Desc.length > 2 && secondPart.includes(pin1Desc))) detectedSourceIdx = 0;
                            else if (secondPart.includes('2') || secondPart.includes('drug') || (pin2Desc.length > 2 && secondPart.includes(pin2Desc))) detectedSourceIdx = 1;
                        } else {
                            // "Move [Source] to [Target]" pattern
                            const moveMatch = promptLow.match(/(?:przenieś|przenies|move|transfer)\s+(.*?)\s+(?:na|do|into|to|onto)\s+(.*)/);
                            if (moveMatch) {
                                const firstPart = moveMatch[1].toLowerCase();
                                const secondPart = moveMatch[2].toLowerCase();
                                const pin1Desc = pins[0]?.description?.toLowerCase() || '';
                                const pin2Desc = pins[1]?.description?.toLowerCase() || '';
                                if (firstPart.includes('1') || firstPart.includes('pierwsz') || (pin1Desc.length > 2 && firstPart.includes(pin1Desc))) detectedSourceIdx = 0;
                                else if (firstPart.includes('2') || firstPart.includes('drug') || (pin2Desc.length > 2 && firstPart.includes(pin2Desc))) detectedSourceIdx = 1;
                                
                                if (secondPart.includes('1') || secondPart.includes('pierwsz') || (pin1Desc.length > 2 && secondPart.includes(pin1Desc)) || thisKeywords.some(kw => secondPart.includes(kw))) detectedTargetIdx = 0;
                                else if (secondPart.includes('2') || secondPart.includes('drug') || (pin2Desc.length > 2 && secondPart.includes(pin2Desc))) detectedTargetIdx = 1;
                            }
                        }

                        if (detectedSourceIdx !== -1 && detectedTargetIdx !== -1) {
                            sourceLayer = layers.find(l => l.id === pins[detectedSourceIdx].layerId);
                            targetLayer = layers.find(l => l.id === pins[detectedTargetIdx].layerId);
                        } else if (detectedSourceIdx !== -1) {
                            sourceLayer = layers.find(l => l.id === pins[detectedSourceIdx].layerId);
                            targetLayer = layers.find(l => l.id === pins[1 - detectedSourceIdx].layerId);
                        } else if (detectedTargetIdx !== -1) {
                            targetLayer = layers.find(l => l.id === pins[detectedTargetIdx].layerId);
                            sourceLayer = layers.find(l => l.id === pins[1 - detectedTargetIdx].layerId);
                        } else if (pin1IsSource || pin2IsTarget) {
                            sourceLayer = layers.find(l => l.id === pins[0].layerId);
                            targetLayer = layers.find(l => l.id === pins[1].layerId);
                        } else if (pin2IsSource || pin1IsTarget) {
                            sourceLayer = layers.find(l => l.id === pins[1].layerId);
                            targetLayer = layers.find(l => l.id === pins[0].layerId);
                        } else {
                            // Default: pin 1 is TARGET (CEL), pin 2 is SOURCE (ŹRÓDŁO)
                            targetLayer = layers.find(l => l.id === pins[0].layerId);
                            sourceLayer = layers.find(l => l.id === pins[1].layerId);
                        }

                        if (promptLow.includes('tutaj') || promptLow.includes('tam')) {
                            if (detectedSourceIdx !== 0 && detectedTargetIdx !== 1) {
                                sourceLayer = layers.find(l => l.id === pins[0].layerId);
                                targetLayer = layers.find(l => l.id === pins[1].layerId);
                            }
                        }

                        if (!sourceLayer || !targetLayer) {
                            throw new Error("Nie udało się zidentyfikować obrazu źródłowego i docelowego.");
                        }
                    }

                    let sourceBase64: string;
                    let targetBase64: string;

                    if (!targetLayer?.src) throw new Error('Brak obrazu docelowego');
                    targetBase64 = await toBase64(targetLayer.src);

                    if (attachedImageUrl) {
                        sourceBase64 = await toBase64(attachedImageUrl);
                    } else if (sourceLayer?.src) {
                        sourceBase64 = await toBase64(sourceLayer.src);
                    } else {
                        throw new Error('Brak obrazu źródłowego (referencji).');
                    }

                    if (!apiKeys.runware) throw new Error('Brak klucza Runware API');

                    updateMessage(loadingId, { content: '🔍 Konfigurowanie rekonstrukcji tożsamości...' });

                    const sourcePinLabel = pins.find(p => p.layerId === sourceLayer?.id)?.description || 'obiekt';
                    const targetPinLabel = pins.find(p => p.layerId === targetLayer?.id)?.description || 'miejsce';

                    const sourceDescription = sourceLayer ? (sourceLayer.name + (sourcePinLabel ? `: ${sourcePinLabel}` : '')) : 'Załączone zdjęcie';
                    const targetDescription = targetLayer ? (targetLayer.name + (targetPinLabel ? `: ${targetPinLabel}` : '')) : 'Obraz na canvasie';

                                        const thoughtProcess = `
### 🔢 KROK PO KROK: Rekonstrukcja Tożsamości
**KROK 1: Przeanalizowanie blueprintu**
- 👤 **Obraz 1 (Blueprint):** ${sourceLayer?.name || 'Załączone zdjęcie'} (Wzór detali, tekstur i cech)
- 📸 **Obraz 2 (Cel):** ${targetLayer?.name} (To edytujemy - tło i poza)

**KROK 2: Analiza ilościowa i przestrzenna**
- Detekcja liczby obiektów (liczba pojedyncza/mnoga)...
- Mapowanie punktów charakterystycznych (pins)...

**KROK 3: Generowanie promptu High-Fidelity**
- Integracja oświetlenia i perspektywy z Obrazu 2...
- Opis obiektu z Obrazu 1...

**KROK 4: Wykonanie transferu (Generowanie od zera)**
- Skalowanie do ${targetLayer?.naturalWidth || targetLayer?.width}x${targetLayer?.naturalHeight || targetLayer?.height}...
- Aktywacja trybu Nano Banana Pro...
`;
                    updateMessage(loadingId, { content: thoughtProcess });

                    const natW = targetLayer.naturalWidth || targetLayer.width;
                    const natH = targetLayer.naturalHeight || targetLayer.height;

                    updateMessage(loadingId, { content: thoughtProcess + '\n\n**SZCZEGÓŁY DZIAŁANIA:**\n- 🎭 Generowanie inteligentnej maski...' });
                    let maskBase64: string | undefined;
                    const targetPins = pins.filter(p => p.layerId === targetLayer?.id);

                    if (targetPins.length === 0) {
                        const targetPin = pins[0];
                        const localX = targetPin.normalizedX * natW;
                        const localY = targetPin.normalizedY * natH;
                        maskBase64 = await getSmartMask(targetBase64, localX, localY, natW, natH);
                    } else {
                        for (const pin of targetPins) {
                            const localX = pin.normalizedX * natW;
                            const localY = pin.normalizedY * natH;
                            const mask = await getSmartMask(targetBase64, localX, localY, natW, natH);
                            if (!maskBase64) maskBase64 = mask;
                            else maskBase64 = await combineMasks(maskBase64, mask, natW, natH);
                        }
                    }

                    if (!maskBase64) throw new Error('Nie udało się wygenerować maski');

                    // --- FULL BODY MASK EXTENSION ---
                    if (swapVariant === 'full-body') {
                        updateMessage(loadingId, { content: thoughtProcess + '\n\n**SZCZEGÓŁY DZIAŁANIA:**\n- 📏 Rozszerzanie maski do pełnej sylwetki...' });
                        maskBase64 = await expandMaskToBottom(maskBase64, natW, natH);
                    }

                    updateMessage(loadingId, { content: thoughtProcess + '\n\n**SZCZEGÓŁY DZIAŁANIA:**\n- ✅ Maska wygenerowana.\n- 🧠 Analizowanie ról i detali (Gemini)...' });
                    
                    const sourcePins = pins.filter(p => p.layerId === sourceLayer?.id);

                    const targetPinInfo = targetPins.map((p) => {
                        const idx = pins.findIndex(p2 => p2.id === p.id);
                        return `Pin ${idx + 1} (CEL): ${p.description || 'punkt'} w ${Math.round(p.normalizedX*100)}%,${Math.round(p.normalizedY*100)}%`;
                    }).join('; ');

                    const sourcePinInfo = sourcePins.map((p) => {
                        const idx = pins.findIndex(p2 => p2.id === p.id);
                        return `Pin ${idx + 1} (ŹRÓDŁO): ${p.description || 'obiekt'} w ${Math.round(p.normalizedX*100)}%,${Math.round(p.normalizedY*100)}%`;
                    }).join('; ');

                    const combinedPinInfo = [targetPinInfo, sourcePinInfo].filter(Boolean).join(' | ');
                    let finalPrompt = prompt;
                    let detailedBlueprint = sourceLayer ? sourceLayer.name : 'source identity';

                    if (apiKeys.gemini && prompt.trim()) {
                        try {
                            const { geminiEnhancePromptForRunware } = await import('@/lib/gemini');

                            // 1. Analyze Quantity (Singular/Plural)
                            const quantityAnalysis = await geminiEnhancePromptForRunware(apiKeys.gemini, prompt, "QUANTITY_ANALYSIS", `Mode: ${mode}, Pins Context: ${combinedPinInfo}`, sourceBase64);
                            console.log("Quantity Analysis:", quantityAnalysis);

                            // 2. Extract Detailed Identity Blueprint (MUST preserve characteristic traits)
                            let detailedBlueprintFallback = "A highly detailed person with realistic skin texture and natural features.";
                            try {
                                const { geminiAnalyzeIdentity } = await import('@/lib/gemini');
                                updateMessage(loadingId, { content: thoughtProcess + '\n\n**SZCZEGÓŁY DZIAŁANIA:**\n- 🎭 Analiza tożsamości (wąsy, okulary, włosy)...' });
                                detailedBlueprint = await geminiAnalyzeIdentity(apiKeys.gemini, sourceBase64);
                            } catch (gemErr) {
                                console.warn("Gemini Identity Analysis failed in Chat (using fallback):", gemErr);
                                detailedBlueprint = detailedBlueprintFallback;
                            }
                            console.log("Visual identity Blueprint:", detailedBlueprint);

                                                        // 3. Synthesize Final Generation Prompt
                            const forceSingular = quantityAnalysis.toLowerCase().includes('singular') ? " MANDATORY: GENERATE EXACTLY ONE INSTANCE ONLY. IGNORE ALL OTHER OBJECTS IN THE SOURCE IMAGE." : "";

                                                        const { geminiEnhanceSwapPrompt } = await import('@/lib/gemini');
                            
                            // ROLE SIMPLIFICATION: PIN 2 (Source) = Identity, PIN 1 (Cel) = Environment/Pose/Mimicry
                            finalPrompt = await geminiEnhanceSwapPrompt(
                                apiKeys.gemini,
                                prompt,
                                sourceBase64, // Always PIN 2 as identity source
                                targetBase64, // Always PIN 1 as environment target
                                `IMAGE 1 (SOURCE IDENTITY): ${detailedBlueprint}, IMAGE 2 (TARGET ENVIRONMENT/POSE): ${targetDescription}, Task: Transfer identity from Image 1 onto the person in Image 2. KEEP POSURE AND MIMICRY FROM IMAGE 2.`,
                                swapVariant
                            );
                        } catch (e) { console.warn("Gemini enhancement failed:", e); }
                    }

                    updateMessage(loadingId, { content: thoughtProcess + '\n\n**SZCZEGÓŁY DZIAŁANIA:**\n- ✅ Analiza ukończona.\n- 🚀 Uruchamianie rekonstrukcji High-Fidelity (Runware)...' });
                    const { width: snappedW, height: snappedH } = snapToSupportedDimensions(natW, natH);

                    // IF we have multiple pins, use the one specifically on the source layer for cropping
                    let finalSourceBase64 = sourceBase64;
                    const sourcePin = pins.find(p => p.layerId === sourceLayer?.id);
                    if (sourcePin && sourceLayer && !attachedImageUrl) {
                        const sx = sourcePin.normalizedX * (sourceLayer.naturalWidth || sourceLayer.width);
                        const sy = sourcePin.normalizedY * (sourceLayer.naturalHeight || sourceLayer.height);
                        finalSourceBase64 = await cropAroundPoint(sourceBase64, sx, sy);
                    }

                    const resizedSource = await resizeBase64(finalSourceBase64, snappedW, snappedH);
                    const resizedTarget = await resizeBase64(targetBase64, snappedW, snappedH);
                    const resizedMask = await resizeBase64(maskBase64!, snappedW, snappedH, 'image/png');
                    const featheredMask = await featherMask(resizedMask, snappedW, snappedH);

                    // Wrap in strict identity transfer template to enforce mask boundaries
                    const finalSwapPrompt = IDENTITY_TRANSFER_TEMPLATE(finalPrompt, swapVariant);

                    const { runwareCharacterSwap } = await import('@/lib/runware');
                    const swapResult = await runwareCharacterSwap(
                        apiKeys.runware,
                        resizedSource, // PIN 2
                        resizedTarget, // PIN 1
                        resizedMask,   // Mask from PIN 1
                        detailedBlueprint,
                        targetDescription,
                        finalSwapPrompt,
                        swapVariant,
                        snappedW,
                        snappedH,
                        detailedBlueprint, // Traits
                        selectedModel
                    );

                    // 6. FINAL COMPOSITING: Preserve original background strictly
                    updateMessage(loadingId, { content: thoughtProcess + '\n\n**SZCZEGÓŁY DZIAŁANIA:**\n- ✅ Rekonstrukcja gotowa.\n- 🎨 Składanie obrazu końcowego (Compositing)...' });
                    
                    const { compositeResult: compositeHelper } = await import('@/lib/runware');
                    // We must use the ORIGINAL mask and NATURAL dimensions for the final composite to ensure 100% alignment
                    const finalCompositedBase64 = await compositeHelper(
                        targetBase64,
                        swapResult.imageUrl,
                        maskBase64!, // Use RAW mask, helper handles resizing/alignment
                        natW,
                        natH
                    );

                    updateMessage(loadingId, {
                        content: '',
                        role: 'assistant',
                        imageUrl: finalCompositedBase64,
                        model: selectedModel
                    });

                    resultUrl = finalCompositedBase64;
                    const placement = getNextPlacement(targetLayer.width * stageScale, targetLayer.height * stageScale, targetLayer.x + targetLayer.width + (20 / stageScale), targetLayer.y);

                    addLayer({
                        type: 'image',
                        src: resultUrl,
                        x: placement.x,
                        y: placement.y,
                        width: placement.width,
                        height: placement.height,
                        naturalWidth: natW,
                        naturalHeight: natH,
                        rotation: targetLayer.rotation,
                        name: `Swap: ${targetLayer.name}`,
                        visible: true,
                        locked: false,
                        originalSrc: targetLayer.src,
                    });
                    clearPins();
                } else if (isRemoveBgIntent) {
                    const imageForRequest = attachedImageUrl || selectedLayer?.src;
                    if (!imageForRequest) throw new Error('Załącz zdjęcie lub wybierz warstwę, aby usunąć tło.');
                    if (!apiKeys.runware) throw new Error('Brak klucza Runware API.');

                    updateMessage(loadingId, { content: '✂️ Wycinam tło (Runware:110@1)...' });
                    
                    const base64 = await toBase64(imageForRequest);
                    const result = await runwareRemoveBackground(apiKeys.runware, base64);
                    resultUrl = result as string;

                    // Get dimensions
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.src = resultUrl;
                    await new Promise((res) => { img.onload = res; });

                    const placement = getNextPlacement(img.width * stageScale, img.height * stageScale);

                    addLayer({
                        type: 'image',
                        src: resultUrl,
                        x: placement.x,
                        y: placement.y,
                        width: placement.width,
                        height: placement.height,
                        naturalWidth: img.width,
                        naturalHeight: img.height,
                        rotation: 0,
                        name: 'Wycięty obiekt',
                        visible: true,
                        locked: false
                    });
                    
                    resultText = '✅ Tło zostało pomyślnie usunięte!';
                } else if (pins.length > 0) {
                    const layer = layers.find((l) => l.id === pins[0].layerId);
                    if (!layer?.src) throw new Error('Brak obrazu pod pinezkami');
                    if (!apiKeys.runware) throw new Error('Brak klucza Runware API.');
                    const base64 = await toBase64(layer.src);
                    const natW = layer.naturalWidth || layer.width;
                    const natH = layer.naturalHeight || layer.height;

                    let finalMaskBase64: string | undefined;
                    const validPins = pins.filter(p => p.layerId === layer.id);
                    for (const pin of validPins) {
                        const localX = pin.normalizedX * natW;
                        const localY = pin.normalizedY * natH;
                        const mask = await getSmartMask(base64, localX, localY, natW, natH);
                        if (!finalMaskBase64) finalMaskBase64 = mask;
                        else finalMaskBase64 = await combineMasks(finalMaskBase64, mask, natW, natH);
                    }

                    let enhancedPrompt = prompt;
                    const descriptions = pins.filter(p => p.description).map(p => p.description);
                    if (descriptions.length > 0) enhancedPrompt = `${prompt}. Focus on: ${descriptions.join(", ")}.`;

                    if (apiKeys.gemini && enhancedPrompt.trim()) {
                        try {
                            updateMessage(loadingId, { content: '🔍 Optymalizacja polecenia...' });
                            const { geminiEnhancePromptForRunware } = await import('@/lib/gemini');
                            enhancedPrompt = await geminiEnhancePromptForRunware(apiKeys.gemini, enhancedPrompt, "EDIT_SINGLE_IMAGE", `Mode: inpaint, Layer: ${layer.name}`, base64);
                        } catch (e) { console.warn("Gemini failed:", e); }
                    }

                    // Wrap in strict inpaint template
                    const finalInpaintPrompt = INPAINT_PROMPT_TEMPLATE(enhancedPrompt);

                    const { width: snappedW, height: snappedH } = snapToSupportedDimensions(natW, natH);
                    const resizedBase64 = await resizeBase64(base64, snappedW, snappedH);
                    const resizedMask = await resizeBase64(finalMaskBase64!, snappedW, snappedH, 'image/png');

                    const aiResult = await runwareInpaint(apiKeys.runware, resizedBase64, resizedMask, finalInpaintPrompt, snappedW, snappedH, selectedModel);

                    // surgical composite for seamless inpaint blending
                    resultUrl = await surgicalComposite(base64, aiResult, resizedMask, natW, natH);
                    const placement = getNextPlacement(layer.width * stageScale, layer.height * stageScale, layer.x + layer.width + (20 / stageScale), layer.y);

                    addLayer({
                        type: 'image',
                        src: resultUrl,
                        x: placement.x,
                        y: placement.y,
                        width: placement.width,
                        height: placement.height,
                        naturalWidth: natW,
                        naturalHeight: natH,
                        rotation: layer.rotation,
                        name: `Edit: ${layer.name}`,
                        visible: true,
                        locked: false,
                        originalSrc: layer.src,
                    });
                    clearPins();
                } else {
                    const imageForRequest = attachedImageUrl || selectedLayer?.src;
                    if (!apiKeys.runware) throw new Error('Brak klucza Runware API.');
                    if (imageForRequest) {
                        const base64 = await toBase64(imageForRequest);
                        const ratW = selectedLayer?.naturalWidth || selectedLayer?.width || 1024;
                        const ratH = selectedLayer?.naturalHeight || selectedLayer?.height || 1024;
                        const { width: snappedW, height: snappedH } = snapToSupportedDimensions(ratW, ratH);
                        const resizedBase64 = await resizeBase64(base64, snappedW, snappedH);
                        let finalPrompt = prompt;
                        if (apiKeys.gemini && finalPrompt.trim()) {
                            try {
                                updateMessage(loadingId, { content: '🔍 Optymalizacja polecenia...' });
                                const { geminiEnhancePromptForRunware } = await import('@/lib/gemini');
                                finalPrompt = await geminiEnhancePromptForRunware(apiKeys.gemini, finalPrompt, "EDIT_SINGLE_IMAGE", undefined, base64);
                            } catch (e) { console.warn("Gemini failed:", e); }
                        }
                        const aiResult = await runwareEditImage(apiKeys.runware, resizedBase64, finalPrompt, snappedW, snappedH, selectedModel);
                        if (selectedLayer) {
                            const natW = selectedLayer.naturalWidth || selectedLayer.width;
                            const natH = selectedLayer.naturalHeight || selectedLayer.height;
                            resultUrl = await restoreResolution(aiResult, natW, natH);
                            const placement = getNextPlacement(selectedLayer.width * stageScale, selectedLayer.height * stageScale, selectedLayer.x + selectedLayer.width + (20 / stageScale), selectedLayer.y);
                            addLayer({
                                type: 'image',
                                src: resultUrl,
                                x: placement.x,
                                y: placement.y,
                                width: placement.width,
                                height: placement.height,
                                naturalWidth: natW,
                                naturalHeight: natH,
                                rotation: selectedLayer.rotation,
                                name: `Edit: ${selectedLayer.name}`,
                                visible: true,
                                locked: false,
                                originalSrc: selectedLayer.src,
                            });
                        } else {
                            resultUrl = aiResult;
                        }
                    } else {
                        let finalPrompt = prompt;
                        if (apiKeys.gemini && finalPrompt.trim()) {
                            try {
                                updateMessage(loadingId, { content: '🔍 Tworzenie opisu wizualnego...' });
                                const { geminiEnhancePromptForRunware } = await import('@/lib/gemini');
                                finalPrompt = await geminiEnhancePromptForRunware(apiKeys.gemini, finalPrompt, "TEXT_TO_IMAGE");
                            } catch (e) { console.warn("Gemini failed:", e); }
                        }
                        const { runwareGenerateImage } = await import('@/lib/runware');
                        resultUrl = await runwareGenerateImage(apiKeys.runware, finalPrompt);
                        if (resultUrl) {
                            const imgEl = new window.Image();
                            imgEl.crossOrigin = 'anonymous';
                            imgEl.src = resultUrl;
                            await new Promise((r, rej) => { imgEl.onload = r; imgEl.onerror = rej; });
                            const placement = getNextPlacement(Math.min(600, imgEl.width || 512) * stageScale, Math.min(600, imgEl.height || 512) * stageScale);
                            addLayer({
                                type: 'image',
                                src: resultUrl,
                                x: placement.x,
                                y: placement.y,
                                width: placement.width,
                                height: placement.height,
                                naturalWidth: imgEl.width || 1024,
                                naturalHeight: imgEl.height || 1024,
                                rotation: 0,
                                name: `AI: ${prompt.slice(0, 30)}`,
                                visible: true,
                                locked: false,
                            });
                            resultText = '✅ Wygenerowano obraz!';
                        }
                    }
                }
            })());

            // Update the loading message with results
            updateMessage(loadingId, {
                isLoading: false,
                content: (resultText || '✅ Gotowe!') + (isSwapIntent && resultUrl ? '\n\n' + (messages.find(m => m.id === loadingId)?.content || '') : ''),
                imageUrl: resultUrl,
            });

            setAttachedImage(null);
        } catch (err) {
            updateMessage(loadingId, {
                isLoading: false,
                content: `❌ ${err instanceof Error ? err.message : 'Nieznany błąd'} `,
            });
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setAttachedImage(ev.target?.result as string);
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const pinLabel = pins.length === 1
        ? '📍 1 pinezka — edycja punktu'
        : pins.length > 1
            ? `📍 ${pins.length} pinezki — edycja wielopunktowa`
            : null;

    return (
        <div className="chat-panel">
            {/* Settings */}
            {showSettings && (
                <div className="settings-panel">
                    <div className="settings-title">Klucze API</div>
                    <div className="settings-field">
                        <label>Runware API</label>
                        <input
                            type="password"
                            value={apiKeys.runware || ''}
                            onChange={(e) => setApiKey('runware', e.target.value)}
                            placeholder="Runware API key..."
                        />
                    </div>
                    <div className="settings-field">
                        <label>Gemini API</label>
                        <input
                            type="password"
                            value={apiKeys.gemini || ''}
                            onChange={(e) => setApiKey('gemini', e.target.value)}
                            placeholder="Gemini API key..."
                        />
                    </div>
                </div>
            )}

            {/* Pin status bar */}
            {pinLabel && (
                <div className="pin-status-bar">
                    <Pin size={13} />
                    <span>{pinLabel}</span>
                    <button className="pin-clear-btn" onClick={clearPins}>✕</button>
                </div>
            )}

            {/* Messages */}
            <div className="chat-messages">
                {messages.length === 0 && (
                    <div className="chat-empty">
                        <Sparkles size={32} className="empty-icon" />
                        <div className="empty-title">Nowa konwersacja</div>
                        <div className="empty-sub">Wpisz prompt lub użyj pinezek na obrazie</div>
                        <div className="chat-hints">
                            <div className="hint-item">
                                <span className="hint-icon">📍</span>
                                <span className="hint-text">1 pinezka → edycja punktu</span>
                            </div>
                            <div className="hint-item">
                                <span className="hint-icon">📍📍</span>
                                <span className="hint-text">2 pinezki → transfer (1: cel, 2: źródło)</span>
                            </div>
                            <div className="hint-item">
                                <span className="hint-icon">✏️</span>
                                <span className="hint-text">opis pinezki → kontekst dla AI</span>
                            </div>
                            <div className="hint-item">
                                <span className="hint-icon">🌟</span>
                                <span className="hint-text">bez pinezek → ogólna edycja / czat</span>
                            </div>
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`chat-msg chat-msg-${msg.role} `}>
                        <div className="msg-avatar">
                            {msg.role === 'user' ? <User size={14} /> : msg.role === 'assistant' ? <Bot size={14} /> : <Sparkles size={14} />}
                        </div>
                        <div className="msg-body">
                            {msg.model && <div className="msg-model">{msg.model}</div>}
                            {msg.isLoading ? (
                                <div className="msg-loading-enhanced-container">
                                    {/* Phase 1: Analysis */}
                                    <div className={`msg-loading-enhanced ${timer > 10 ? 'completed' : ''} `}>
                                        <div className="msg-loading-header">
                                            {timer > 10 ? (
                                                <Sparkles size={16} className="text-green-400" />
                                            ) : (
                                                <Loader2 size={16} className="spin" />
                                            )}
                                            <span>
                                                {timer > 10
                                                    ? 'Zakończono analizę'
                                                    : (msg.pins && msg.pins.length > 1 ? 'Analizowanie zdjęć...' : 'Analizowanie zdjęcia...')
                                                }
                                            </span>
                                            <span className="timer-badge">
                                                {timer > 10 ? '10s / 10s' : `${formatTime(timer)} / 00:10`
                                                }
                                            </span >
                                        </div >
                                        <div className="progress-bar-container">
                                            <div
                                                className="progress-bar-fill"
                                                style={{
                                                    width: `${Math.min(100, (timer / 10) * 100)}%`,
                                                    backgroundColor: timer > 10 ? '#4ade80' : undefined
                                                }}
                                            />
                                        </div>
                                        <div className="executing-label">
                                            {timer > 10 ? 'ZAKOŃCZONO' : 'EXECUTING'}
                                        </div>
                                    </div >

                                    {/* Phase 2: Generation (only shows after 10s) */}
                                    {
                                        timer > 10 && (
                                            <div className="msg-loading-enhanced mt-3 animate-in fade-in slide-in-from-top-2 duration-500">
                                                <div className="msg-loading-header">
                                                    <Loader2 size={16} className="spin" />
                                                    <span>Generowanie...</span>
                                                    <span className="timer-badge">
                                                        {formatTime(Math.max(0, timer - 10))} / 01:30
                                                    </span>
                                                </div>
                                                <div className="progress-bar-container">
                                                    <div
                                                        className="progress-bar-fill"
                                                        style={{
                                                            width: `${Math.min(100, ((timer - 10) / 90) * 100)}%`,
                                                            backgroundColor: timer > 60 ? '#ffb340' : undefined
                                                        }}
                                                    />
                                                </div>
                                                <div className="executing-label">
                                                    {timer > 60 ? 'FINALIZOWANIE...' : 'EXECUTING'}
                                                </div>
                                            </div>
                                        )
                                    }
                                </div >
                            ) : (
                                <div className="msg-content">
                                    {msg.pins && msg.pins.length > 0 && (
                                        <div className="msg-pins-row">
                                            {msg.pins.map((p, idx) => (
                                                <PinBadge key={idx} pin={p} snapshot={p.imageSnapshot} index={idx} />
                                            ))}
                                        </div>
                                    )}
                                    {msg.content}
                                </div>
                            )}
                            {
                                msg.imageUrl && (
                                    <div className="msg-image-wrap">
                                        <img src={msg.imageUrl} alt="Wynik AI" className="msg-image" />
                                    </div>
                                )
                            }
                        </div >
                    </div >
                ))}
                <div ref={messagesEndRef} />
            </div >

            {/* Attached image preview */}
            {attachedImageUrl && (
                <div className="attached-preview">
                    <img src={attachedImageUrl} alt="załącznik" />
                    <button className="remove-attach" onClick={() => setAttachedImage(null)}>
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Input Area */}
            <div className="chat-input-container">
                {pins.length > 0 && selectedLayer && (
                    <div className="active-pins-preview">
                        {pins.map((p, idx) => (
                            <PinBadge key={p.id} pin={p} index={idx} />
                        ))}
                    </div>
                )}
                <div className="input-inner">
                    <button className="attach-btn" onClick={() => fileInputRef.current?.click()}>
                        <Paperclip size={18} />
                    </button>
                    <textarea
                        className="chat-textarea"
                        placeholder={pins.length > 0 ? "Co mamy zmienić w tym miejscu?" : "Opisz swój pomysł..."}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                    />
                </div>
                <div className="input-bottom">
                    <div className="model-selector-container" ref={modelSelectorRef}>
                        <button 
                            className={`model-selector-trigger ${showModelSelector ? 'active' : ''}`}
                            onClick={() => setShowModelSelector(!showModelSelector)}
                        >
                            <Bot size={14} className="model-icon" />
                            <span className="model-label">Model:</span>
                            <span className="model-name">{getModelName(selectedModel)}</span>
                            <Settings size={12} className={`chevron ${showModelSelector ? 'rotate' : ''}`} />
                        </button>

                        {showModelSelector && (
                            <div className="model-popover animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <div className="popover-header">Wybierz Model AI</div>
                                <div className="model-list">
                                    {models.map(m => (
                                        <button 
                                            key={m.id} 
                                            className={`model-option ${selectedModel === m.id ? 'selected' : ''}`}
                                            onClick={() => {
                                                setSelectedModel(m.id);
                                                setShowModelSelector(false);
                                            }}
                                        >
                                            <span className="option-icon">{m.icon}</span>
                                            <div className="option-info">
                                                <div className="option-name">{m.name}</div>
                                                <div className="option-desc">{m.desc}</div>
                                            </div>
                                            {selectedModel === m.name && <div className="active-dot" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        className={`send-btn ${isLoading ? 'loading' : ''} ${(!input.trim() && !attachedImageUrl) ? 'disabled' : ''}`}
                        onClick={handleSendMessage}
                        disabled={isLoading || (!input.trim() && !attachedImageUrl)}
                    >
                        {isLoading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
                        <span>{isLoading ? 'Przetwarzam...' : 'Wyślij'}</span>
                    </button>
                </div>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div >
    );
}
