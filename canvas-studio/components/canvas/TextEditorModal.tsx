'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, MessageSquare, Zap } from 'lucide-react';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { runwareInpaint, ensureBase64 } from '@/lib/runware';
import { getSmartMask } from '@/lib/segmentation';

export default function TextEditorModal() {
    const {
        textEditorOpen, setTextEditorOpen,
        textAnalysis, selectedLayerIds, layers,
        updateLayer, textEditMask, setTextEditMask, setTextAnalysis
    } = useCanvasStore();

    const { apiKeys, addMessage, updateMessage } = useChatStore();
    const [textBlocks, setTextBlocks] = useState<any[]>([]);
    const [isApplying, setIsApplying] = useState(false);

    useEffect(() => {
        if (textEditorOpen && textAnalysis) {
            try {
                // If it's just raw text, not JSON
                if (!textAnalysis.includes('[') && !textAnalysis.includes('{')) {
                    setTextBlocks([{ id: 'manual-1', text: textAnalysis.trim() }]);
                    return;
                }

                const cleaned = textAnalysis.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleaned);
                
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setTextBlocks(parsed);
                } else if (parsed && parsed.text) {
                    setTextBlocks([parsed]);
                } else {
                    setTextBlocks([{ id: 'manual-1', text: textAnalysis.trim() }]);
                }
            } catch (e) {
                // Fallback if parsing completely fails, treat the whole response as the found text
                setTextBlocks([{ id: 'manual-2', text: textAnalysis.trim() || 'Wpisz treść do edycji...' }]);
            }
        }
    }, [textEditorOpen, textAnalysis]);

    if (!textEditorOpen) return null;

    const selectedLayer = layers.find(l => selectedLayerIds.includes(l.id));

    const handleApplyAll = async () => {
        if (!selectedLayer || !selectedLayer.src) return;
        if (!apiKeys.runware) {
            alert('Brak klucza API Runware');
            return;
        }

        setIsApplying(true);
        const msgId = addMessage({ role: 'system', content: '⏳ Rozpoczynam edycję tekstu (BFL 4@1)...' });

        try {
            // STEP 2: Create highly detailed prompt
            let changesDescription = '';
            textBlocks.forEach((block, idx) => {
                const newText = block.newText !== undefined ? block.newText : block.text;
                if (newText !== block.text) {
                    changesDescription += `Replace the text "${block.text}" with "${newText}". `;
                }
            });

            if (!changesDescription) {
                updateMessage(msgId, { content: 'ℹ️ Nie wprowadzono żadnych zmian w tekście.' });
                setIsApplying(false);
                return;
            }

            const masterPrompt = `Meticulous text replacement task. 
            ${changesDescription}
            CRITICAL: Only change the specified text areas indicated by the mask. 
            Keep everything else exactly the same - the same font style, size, color, kerning, and orientation. 
            The new text must integrate perfectly into the environment with identical texture, shadows, and lighting. 
            Do not modify the background outside the text area.`;

            // STEP 3: Execution
            // Use the brush mask if available, otherwise fallback to smart mask
            let maskUrl = textEditMask;
            
            if (!maskUrl) {
                updateMessage(msgId, { content: '🔍 Generuję inteligentną maskę...' });
                maskUrl = await getSmartMask(
                    selectedLayer.src,
                    selectedLayer.width / 2,
                    selectedLayer.height / 2,
                    selectedLayer.width,
                    selectedLayer.height
                );
            }

            // Calculate target dimensions based on aspect ratio
            const aspect = selectedLayer.width / selectedLayer.height;
            let targetWidth = 1024;
            let targetHeight = 1024;

            if (aspect > 1) {
                targetHeight = Math.round(1024 / aspect);
            } else {
                targetWidth = Math.round(1024 * aspect);
            }

            const { MODEL_BFL } = await import('@/lib/runware');

            const resultUrl = await runwareInpaint(
                apiKeys.runware,
                selectedLayer.src,
                maskUrl,
                masterPrompt,
                targetWidth,
                targetHeight,
                MODEL_BFL // Use model bfl:4@1 as requested
            );

            // STEP 4: Verification (Visual confirmation in store/UI)
            updateLayer(selectedLayer.id, {
                src: resultUrl,
                originalSrc: selectedLayer.src
            });

            updateMessage(msgId, { content: '✅ Tekst został pomyślnie zmieniony przy użyciu BFL 4@1!' });
            setIsApplying(false);
            setTextEditorOpen(false);
            setTextEditMask(null);
            setTextAnalysis('');
        } catch (error: any) {
            updateMessage(msgId, { content: `❌ Błąd edycji: ${error.message}` });
            setIsApplying(false);
        }
    };

    const updateBlockText = (id: string, newText: string) => {
        setTextBlocks(prev => prev.map(b => b.id === id ? { ...b, newText } : b));
    };

    return (
        <div className="text-editor-overlay" onClick={() => setTextEditorOpen(false)}>
            <div className="text-editor-modal" onClick={(e) => e.stopPropagation()}>
                <div className="text-editor-header">
                    <Edit3 size={18} color="#666" />
                    <h3>Edit Text</h3>
                </div>

                <div className="text-editor-body" style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
                    {textBlocks.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>Nie znaleziono słów lub fraz. Spróbuj powtórzyć analizę.</p>
                    ) : (
                        textBlocks.map((block, idx) => (
                            <div key={block.id || idx} className="text-block-input-wrapper" style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Znaleziony tekst na zdjęciu (Oryginał):</div>
                                <div style={{ fontSize: '14px', color: 'white', fontWeight: 600, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginBottom: '12px', wordBreak: 'break-word' }}>
                                    "{block.text}"
                                </div>
                                
                                <div style={{ fontSize: '11px', color: 'var(--accent)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nowa treść (zastąp):</div>
                                <input
                                    className="text-block-input"
                                    type="text"
                                    value={block.newText !== undefined ? block.newText : ''}
                                    onChange={(e) => updateBlockText(block.id || idx, e.target.value)}
                                    placeholder="Wpisz na co chcesz zamienić wyraz wyżej..."
                                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'white', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                                />
                            </div>
                        ))
                    )}
                </div>

                <div className="text-editor-footer">
                    <button
                        className="btn-cancel"
                        onClick={() => setTextEditorOpen(false)}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn-apply-edits"
                        onClick={handleApplyAll}
                        disabled={isApplying}
                    >
                        {isApplying ? 'Processing...' : 'Apply edits'}
                    </button>
                </div>
            </div>
        </div>
    );
}
