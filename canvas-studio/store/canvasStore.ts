import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type ToolType = 'select' | 'move' | 'pen' | 'text' | 'rect' | 'pin' | 'brush' | 'zoom-in' | 'zoom-out';

export interface CanvasLayer {
    id: string;
    type: 'image' | 'text' | 'shape';
    src?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    naturalWidth?: number;  // original image resolution
    naturalHeight?: number; // original image resolution
    rotation: number;
    name: string;
    visible: boolean;
    locked: boolean;
    originalSrc?: string;

    // Text properties
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;

    // Shared color/style properties
    fill?: string;
    stroke?: string;
    strokeWidth?: number;

    // Shape properties
    shapeType?: 'rect' | 'circle' | 'triangle';
}

export interface PinMarker {
    id: string;
    // Normalized coordinates (0-1) relative to image width/height
    normalizedX: number;
    normalizedY: number;
    layerId: string;
    description?: string;
    confirmed?: boolean;
    suggestions?: string[];
    isAnalyzing?: boolean;
}

interface CanvasState {
    layers: CanvasLayer[];
    selectedLayerIds: string[];
    activeTool: ToolType;
    pins: PinMarker[];
    stageScale: number;
    stagePos: { x: number; y: number };
    // What the user is doing with pins
    pinMode: 'edit' | 'adjust' | 'transfer' | null;

    // Text Editor UI State
    textEditorOpen: boolean;
    textAnalysis: string;

    // Brush Tool Mode
    brushMode: 'remove' | 'text-edit' | null;
    textEditMask: string | null;

    // Canvas dimensions (physical size of container)
    canvasDimensions: { width: number; height: number };
    clipboard: CanvasLayer | null;

    setTextEditorOpen: (open: boolean) => void;
    setTextAnalysis: (analysis: string) => void;
    setBrushMode: (mode: 'remove' | 'text-edit' | null) => void;
    setTextEditMask: (mask: string | null) => void;
    setCanvasDimensions: (width: number, height: number) => void;

    addLayer: (layer: Omit<CanvasLayer, 'id'>) => string;
    removeLayer: (id: string) => void;
    updateLayer: (id: string, updates: Partial<CanvasLayer>) => void;
    selectLayers: (ids: string[]) => void;
    toggleLayerSelection: (id: string) => void;
    setActiveTool: (tool: ToolType) => void;
    addPin: (pin: Omit<PinMarker, 'id' | 'normalizedX' | 'normalizedY'>, canvasX: number, canvasY: number) => void;
    updatePinDescription: (id: string, description: string) => void;
    updatePinSuggestions: (id: string, suggestions: string[]) => void;
    confirmPin: (id: string) => void;
    removePin: (id: string) => void;
    clearPins: () => void;
    setStageScale: (scale: number) => void;
    setStagePos: (pos: { x: number; y: number }) => void;
    setPinMode: (mode: 'edit' | 'adjust' | 'transfer' | null) => void;
    moveLayerUp: (id: string) => void;
    moveLayerDown: (id: string) => void;
    duplicateLayer: (id: string) => void;
    copySelectedLayer: () => void;
    pasteAt: (x: number, y: number) => void;
    updatePinAnalysisState: (id: string, isAnalyzing: boolean) => void;

    // Helper to calculate non-overlapping placement
    getNextPlacement: (width: number, height: number, prefX?: number, prefY?: number) => { x: number, y: number, width: number, height: number };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
    layers: [],
    selectedLayerIds: [],
    activeTool: 'select',
    pins: [],
    stageScale: 1,
    stagePos: { x: 0, y: 0 },
    pinMode: null,
    textEditorOpen: false,
    textAnalysis: '',
    brushMode: null,
    textEditMask: null,
    canvasDimensions: { width: 0, height: 0 },
    clipboard: null,

    setTextEditorOpen: (open) => set({ textEditorOpen: open }),
    setTextAnalysis: (analysis) => set({ textAnalysis: analysis }),
    setBrushMode: (mode) => set({ brushMode: mode }),
    setTextEditMask: (mask) => set({ textEditMask: mask }),
    setCanvasDimensions: (width, height) => set({ canvasDimensions: { width, height } }),

    addLayer: (layer) => {
        const id = uuidv4();
        set((s) => ({ layers: [...s.layers, { ...layer, id }] }));
        return id;
    },

    getNextPlacement: (width, height, prefX, prefY) => {
        const state = get();
        const { layers, stageScale, stagePos, canvasDimensions } = state;
        const gap = 40 / stageScale; // 40px buffer gap in stage units

        // 1. Calculate base sizes in stage units
        const wScaled = width / stageScale;
        const hScaled = height / stageScale;

        // 2. Decide starting point
        let startX: number;
        let startY: number;

        if (prefX !== undefined && prefY !== undefined) {
            startX = prefX;
            startY = prefY;
        } else {
            // Default to viewport center
            startX = (canvasDimensions.width / 2 - width / 2) / stageScale - stagePos.x / stageScale;
            startY = (canvasDimensions.height / 2 - height / 2) / stageScale - stagePos.y / stageScale;
        }

        // 3. Collision check helper
        const collides = (x: number, y: number) => {
            return layers.some(l => {
                const buffer = 20 / stageScale;
                return !(
                    x + wScaled + buffer < l.x ||
                    x > l.x + l.width + buffer ||
                    y + hScaled + buffer < l.y ||
                    y > l.y + l.height + buffer
                );
            });
        };

        // 4. Search for free space
        // We'll use a simple stepping algorithm: try right, then down
        let curX = startX;
        let curY = startY;
        const step = 50 / stageScale;
        const maxAttempts = 100; // safety fuse
        let attempts = 0;

        while (collides(curX, curY) && attempts < maxAttempts) {
            attempts++;
            // Try shifting right
            curX += step;

            // If we've shifted too far right (relative to start), move down and reset X
            if (curX > startX + 1500 / stageScale) {
                curX = startX;
                curY += step;
            }
        }

        return { x: curX, y: curY, width: wScaled, height: hScaled };
    },

    removeLayer: (id) =>
        set((s) => ({
            layers: s.layers.filter((l) => l.id !== id),
            selectedLayerIds: s.selectedLayerIds.filter(sid => sid !== id),
        })),

    updateLayer: (id, updates) =>
        set((s) => ({
            layers: s.layers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        })),

    selectLayers: (ids) => set({ selectedLayerIds: ids }),

    toggleLayerSelection: (id) => set((s) => ({
        selectedLayerIds: s.selectedLayerIds.includes(id)
            ? s.selectedLayerIds.filter(sid => sid !== id)
            : [...s.selectedLayerIds, id]
    })),

    setActiveTool: (tool) => set({ activeTool: tool }),

    addPin: (pin, canvasX, canvasY) =>
        set((s) => {
            const layer = s.layers.find(l => l.id === pin.layerId);
            if (!layer) return s;

            // Calculate normalized coordinates
            const localX = canvasX - layer.x;
            const localY = canvasY - layer.y;
            const normalizedX = localX / layer.width;
            const normalizedY = localY / layer.height;

            const newPin: PinMarker = {
                ...pin,
                id: uuidv4(),
                normalizedX,
                normalizedY,
                confirmed: false,
            };
            // Preserve modes that require multiple pins
            let newMode = s.pinMode;
            if (newMode !== 'adjust' && newMode !== 'transfer') {
                newMode = 'edit';
            }

            return {
                pins: [...s.pins, newPin],
                pinMode: newMode,
            };
        }),

    confirmPin: (id) =>
        set((s) => ({
            pins: s.pins.map(p => p.id === id ? { ...p, confirmed: true } : p)
        })),

    updatePinDescription: (id: string, description: string) =>
        set((s) => ({
            pins: s.pins.map(p => p.id === id ? { ...p, description } : p)
        })),

    updatePinSuggestions: (id: string, suggestions: string[]) =>
        set((s) => ({
            pins: s.pins.map(p => p.id === id ? { ...p, suggestions } : p)
        })),

    removePin: (id) =>
        set((s) => {
            const newPins = s.pins.filter((p) => p.id !== id);
            return { pins: newPins, pinMode: newPins.length > 0 ? 'edit' : null };
        }),

    clearPins: () => set({ pins: [], pinMode: null }),

    setStageScale: (scale) => set({ stageScale: Math.max(0.05, Math.min(5, scale)) }),

    setStagePos: (pos) => set({ stagePos: pos }),

    setPinMode: (mode) => set({ pinMode: mode }),

    moveLayerUp: (id) =>
        set((s) => {
            const idx = s.layers.findIndex((l) => l.id === id);
            if (idx >= s.layers.length - 1) return s;
            const layers = [...s.layers];
            [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
            return { layers };
        }),

    moveLayerDown: (id) =>
        set((s) => {
            const idx = s.layers.findIndex((l) => l.id === id);
            if (idx <= 0) return s;
            const layers = [...s.layers];
            [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]];
            return { layers };
        }),

    duplicateLayer: (id) => {
        const layer = get().layers.find((l) => l.id === id);
        if (!layer) return;
        const newLayer = {
            ...layer,
            x: layer.x + 40,
            y: layer.y + 40,
            name: `${layer.name} (Kopia)`
        };
        const newId = get().addLayer(newLayer);
        get().selectLayers([newId]);
    },

    copySelectedLayer: () => {
        const state = get();
        const selectedId = state.selectedLayerIds[0];
        if (!selectedId) return;
        const layer = state.layers.find(l => l.id === selectedId);
        if (layer) {
            set({ clipboard: { ...layer } });
        }
    },

    pasteAt: (x, y) => {
        const { clipboard } = get();
        if (!clipboard) return;
        
        const newLayer = {
            ...clipboard,
            x,
            y,
            name: `${clipboard.name} (Wklejony)`
        };
        const newId = get().addLayer(newLayer);
        get().selectLayers([newId]);
    },
    updatePinAnalysisState: (id: string, isAnalyzing: boolean) =>
        set((s) => ({
            pins: s.pins.map((p) => (p.id === id ? { ...p, isAnalyzing } : p)),
        })),
}));
