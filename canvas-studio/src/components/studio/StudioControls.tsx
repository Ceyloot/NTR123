'use client';

import React, { useState, useRef } from 'react';
import { Sparkles, SlidersHorizontal, Image as ImageIcon, ChevronDown } from 'lucide-react';
import { generatePhotoSelectedModel } from '@/src/pages/StudioActions';

interface StudioControlsProps {
    onGenerate: (prompt: string, model: any, aspectRatio: string, resolution: string, refImage: string | null) => void;
    isGenerating: boolean;
}

const MODELS = [
    { id: 'nano-banana-pro', label: 'Nano Banana 2 Pro', capabilities: { img2img: true } },
    { id: 'turbo', label: 'Turbo (Flux Schnell)', capabilities: { img2img: true } },
    { id: 'ultra', label: 'Ultra (Flux Dev)', capabilities: { img2img: true } },
];

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:2', '2:3', '3:4'];
const RESOLUTIONS = ['1K', '2K', '4K'];

export default function StudioControls({ onGenerate, isGenerating }: StudioControlsProps) {
    const [prompt, setPrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState(MODELS[0]);
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [resolution, setResolution] = useState('2K');
    const [referenceImage, setReferenceImage] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Global paste handler for images
    React.useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (!file) continue;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (event.target?.result) {
                            setReferenceImage(event.target.result as string);
                        }
                    };
                    reader.readAsDataURL(file);
                    break; // Only handle the first image
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const handleGenerateClick = () => {
        if (!prompt.trim()) return;
        onGenerate(prompt, selectedModel.id, aspectRatio, resolution, referenceImage);
        setActiveDropdown(null);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setReferenceImage(event.target.result as string);
            }
        };
        reader.readAsDataURL(file);
    };

    const toggleDropdown = (name: string) => {
        setActiveDropdown(activeDropdown === name ? null : name);
    };

    return (
        <div className="studio-controls-wrapper">
            {/* Prompt Area */}
            <div className="studio-prompt-container">
                {referenceImage && (
                    <div className={`prompt-image-preview ${!selectedModel.capabilities.img2img ? 'unsupported' : ''}`}>
                        <img src={referenceImage} alt="Reference" />
                        {!selectedModel.capabilities.img2img && (
                            <div className="unsupported-overlay">
                                <span>Model nie wspiera img2img</span>
                            </div>
                        )}
                        <button
                            className="remove-preview-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                setReferenceImage(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                        >
                            ✕
                        </button>
                    </div>
                )}
                <input
                    type="text"
                    className="studio-prompt-input"
                    placeholder={referenceImage ? (selectedModel.capabilities.img2img ? "Opisz jak zmodyfikować to zdjęcie..." : "Usuń zdjęcie, aby pisać...") : "Opisz obraz, który chcesz wygenerować..."}
                    value={prompt}
                    disabled={!!(referenceImage && !selectedModel.capabilities.img2img)}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleGenerateClick();
                        }
                    }}
                />
            </div>

            {/* Controls Area */}
            <div className="studio-options-container">
                {/* Model Selector */}
                <div className="studio-model-selector" onClick={() => toggleDropdown('model')}>
                    <span className="model-label">{selectedModel.label}</span>
                    <ChevronDown size={14} className="model-chevron" />

                    {activeDropdown === 'model' && (
                        <div className="studio-dropdown">
                            {MODELS.map(m => (
                                <div
                                    key={m.id}
                                    className={`dropdown-item ${selectedModel.id === m.id ? 'active' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedModel(m);
                                        setActiveDropdown(null);
                                    }}
                                >
                                    <div className="item-label-row">
                                        <span>{m.label}</span>
                                        {!m.capabilities.img2img && <span className="capability-tag">No img2img</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Img2Img Toggle / Upload */}
                <div
                    className={`studio-option-btn dashed-border ${referenceImage ? 'active has-image' : ''} ${!selectedModel.capabilities.img2img ? 'disabled' : ''}`}
                    onClick={() => selectedModel.capabilities.img2img && fileInputRef.current?.click()}
                    title={!selectedModel.capabilities.img2img ? "Ten model nie obsługuje przesyłania zdjęć" : ""}
                >
                    <ImageIcon size={16} />
                    <span>{referenceImage ? 'Zmień zdjęcie' : 'img2img'}</span>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={handleFileUpload}
                    />
                </div>

                {/* Aspect Ratio */}
                <div
                    className={`studio-option-btn cursor-pointer ${(aspectRatio !== '1:1' || activeDropdown === 'aspect') ? 'active' : ''}`}
                    onClick={() => toggleDropdown('aspect')}
                >
                    <div className="aspect-ratio-icon" style={{
                        width: aspectRatio.split(':')[0] > aspectRatio.split(':')[1] ? '18px' : aspectRatio.split(':')[0] < aspectRatio.split(':')[1] ? (aspectRatio === '9:16' || aspectRatio === '2:3' ? '10px' : '12px') : '14px',
                        height: aspectRatio.split(':')[1] > aspectRatio.split(':')[0] ? '18px' : aspectRatio.split(':')[1] < aspectRatio.split(':')[0] ? (aspectRatio === '16:9' || aspectRatio === '3:2' ? '10px' : '12px') : '14px',
                        border: '1.5px solid currentColor',
                        borderRadius: '2px',
                        transition: 'all 0.2s',
                        flexShrink: 0
                    }} />
                    <span>{aspectRatio}</span>
                    <ChevronDown size={12} style={{ opacity: 0.5, transform: activeDropdown === 'aspect' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />

                    {activeDropdown === 'aspect' && (
                        <div className="studio-dropdown mini">
                            {ASPECT_RATIOS.map(ar => (
                                <div
                                    key={ar}
                                    className={`dropdown-item ${aspectRatio === ar ? 'active' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setAspectRatio(ar);
                                        setActiveDropdown(null);
                                    }}
                                >
                                    {ar}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Resolution */}
                <div
                    className={`studio-option-btn cursor-pointer ${(resolution !== '1K' || activeDropdown === 'res') ? 'active' : ''}`}
                    onClick={() => toggleDropdown('res')}
                >
                    <span>✧</span>
                    <span>{resolution}</span>
                    <ChevronDown size={12} style={{ opacity: 0.5, transform: activeDropdown === 'res' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />

                    {activeDropdown === 'res' && (
                        <div className="studio-dropdown mini">
                            {RESOLUTIONS.map(r => (
                                <div
                                    key={r}
                                    className={`dropdown-item ${resolution === r ? 'active' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setResolution(r);
                                        setActiveDropdown(null);
                                    }}
                                >
                                    {r}
                                </div>
                            ))}
                        </div>
                    )}
                </div>


                {/* Spacer */}
                <div style={{ flex: 1 }}></div>

                {/* Generate Button */}
                <button
                    className="studio-generate-btn"
                    onClick={handleGenerateClick}
                    disabled={isGenerating || !prompt.trim()}
                >
                    <Sparkles size={16} className={isGenerating ? "spin-animation" : ""} />
                    {isGenerating ? "Generowanie..." : "Generuj"}
                </button>
            </div>
        </div>
    );
}
