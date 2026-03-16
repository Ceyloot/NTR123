import React, { useRef, useState, useCallback, useEffect } from 'react';
import TextEditorModal from './TextEditorModal';
import { useCanvasStore, CanvasLayer, PinMarker, ToolType } from '@/store/canvasStore';
import { Stage, Layer, Rect, Transformer, Circle, Line, Text as KonvaText, Image as KonvaImage, Group } from 'react-konva';
import { 
    Copy, Scissors, Trash2, Files, Download, Upload, 
    MousePointer2, ZoomIn, ZoomOut, Check, X, ArrowUp, ArrowDown, Pin,
    Maximize2, Image as ImageIcon
} from 'lucide-react';
import type Konva from 'konva';

// ---- useImage hook ----
function useLoadedImage(src: string | undefined): HTMLImageElement | undefined {
    const [image, setImage] = useState<HTMLImageElement | undefined>();
    useEffect(() => {
        if (!src) { setImage(undefined); return; }
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setImage(img);
        img.onerror = () => setImage(undefined);
        img.src = src;
    }, [src]);
    return image;
}

const UI_STYLES = `
/* ===== PIN SIDEBAR (LEFT) ===== */
.pin-sidebar {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: 80px; 
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 15, 0.7);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 20px;
  width: 240px;
  gap: 16px;
  z-index: 30;
  box-shadow: 
    0 20px 50px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  animation: slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideInLeft {
  from { transform: translateY(-50%) translateX(-20px); opacity: 0; }
  to { transform: translateY(-50%) translateX(0); opacity: 1; }
}

.pin-sidebar-header {
  font-size: 10px;
  font-weight: 900;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pin-sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pin-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: default;
}

.pin-list-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateX(4px);
}

.pin-list-thumb {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #000;
  flex-shrink: 0;
}

.pin-list-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pin-list-num {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: white;
  font-size: 10px;
  font-weight: 900;
  border-radius: 5px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.pin-list-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pin-list-role {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.pin-list-role.cel { color: var(--accent); }
.pin-list-role.zrodlo { color: var(--yellow); }

.pin-list-desc {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== CANVAS BADGES ===== */
.layer-role-badge {
    position: absolute;
    z-index: 100;
    pointer-events: none;
    transform: translateY(-100%);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 8px 8px 0 0;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
    animation: fadeIn 0.3s ease-out;
}

.layer-role-badge.cel {
    background: var(--accent);
    color: white;
    border: 1px solid rgba(255,255,255,0.2);
}

.layer-role-badge.zrodlo {
    background: var(--yellow);
    color: #000;
    border: 1px solid rgba(0,0,0,0.1);
}

.ctx-menu-item:disabled {
  opacity: 0.3 !important;
  cursor: not-allowed !important;
}

/* ===== BRUSH BANNER SPECIFICS ===== */
.mode-banner.brush {
  border-color: var(--accent);
  background: rgba(14, 165, 233, 0.15);
  backdrop-filter: blur(24px);
  padding: 8px 12px 8px 24px;
}

.mode-banner .btn-confirm {
  background: var(--accent);
  color: white;
  font-weight: 700;
  padding: 6px 16px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.mode-banner .btn-confirm:hover {
  background: var(--accent-hover);
  transform: scale(1.05);
}

.mode-banner .btn-cancel {
  background: rgba(255,255,255,0.1);
  color: white;
  padding: 6px 16px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-banner .btn-cancel:hover {
  background: rgba(255,255,255,0.2);
}
`;

// ---- Single image layer ----
interface ImageLayerProps {
    layer: CanvasLayer;
    isSelected: boolean;
    onSelect: () => void;
    onChange: (attrs: { x: number; y: number; width: number; height: number }) => void;
    onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    activeTool: ToolType;
}

function ImageLayerNode({ layer, isSelected, activeTool, onSelect, onChange, onContextMenu }: ImageLayerProps) {
    const image = useLoadedImage(layer.src);
    const shapeRef = useRef<Konva.Image>(null);
    const pins = useCanvasStore(state => state.pins);

    // Handle aspect ratio preservation when image changes (e.g. after edit/upscale)
    useEffect(() => {
        if (image && image.width && image.height) {
            const currentRatio = layer.width / layer.height;
            const naturalRatio = image.width / image.height;

            // If the difference is significant (>1%), adjust height to match natural ratio
            if (Math.abs(currentRatio - naturalRatio) > 0.01) {
                onChange({
                    ...layer,
                    height: layer.width / naturalRatio
                });
            }
        }
    }, [image?.src]);

    return (
        <KonvaImage
            ref={shapeRef}
            id={layer.id}
            image={image}
            x={layer.x}
            y={layer.y}
            width={layer.width}
            height={layer.height}
            rotation={layer.rotation}
            draggable={activeTool === 'select'} // Only draggable in select mode
            onClick={(e) => {
                if (activeTool !== 'select') return;
                onSelect();
            }}
            onTap={(e) => {
                if (activeTool !== 'select') return;
                onSelect();
            }}
            onContextMenu={onContextMenu}
            onDragMove={(e) => {
                if (activeTool !== 'select') return;
                onChange({ ...layer, x: e.target.x(), y: e.target.y() });
            }}
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                if (activeTool !== 'select') return;
                onChange({ ...layer, x: e.target.x(), y: e.target.y() });
            }}
            stroke={isSelected ? '#0ea5e9' : 'transparent'}
            strokeWidth={isSelected ? 2 : 0}
            shadowBlur={isSelected ? 16 : 0}
            shadowColor="#0ea5e9"
            shadowOpacity={0.5}
        />
    );
}

// ---- Pin Marker ----
interface PinMarkerNodeProps {
    pin: PinMarker;
    index: number;
    layer: CanvasLayer;
    stageScale: number;
    onRemove: () => void;
    onDescriptionChange: (desc: string) => void;
}

function PinMarkerNode({ pin, index, layer, stageScale, onRemove, onDescriptionChange }: PinMarkerNodeProps) {
    const x = layer.x + pin.normalizedX * layer.width;
    const y = layer.y + pin.normalizedY * layer.height;
    
    const pinsCount = useCanvasStore(state => state.pins.length);
    const isTarget = index === 0;
    const roleText = isTarget ? 'CEL' : 'ŹRÓDŁO';
    const showRole = pinsCount > 1;

    return (
        <Group x={x} y={y}>
            {/* Role Label Tooltip-style (Only if > 1 pin) */}
            {showRole && (
                <Group y={-32 / stageScale}>
                    <Rect
                        x={-30 / stageScale}
                        y={-8 / stageScale}
                        width={60 / stageScale}
                        height={16 / stageScale}
                        fill={isTarget ? '#0ea5e9' : '#f59e0b'}
                        cornerRadius={4 / stageScale}
                        shadowBlur={4}
                        shadowOpacity={0.3}
                    />
                    <KonvaText
                        text={roleText}
                        width={60 / stageScale}
                        x={-30 / stageScale}
                        y={-8 / stageScale}
                        height={16 / stageScale}
                        fontSize={10 / stageScale}
                        fontFamily="Inter, sans-serif"
                        fontStyle="bold"
                        fill="#ffffff"
                        align="center"
                        verticalAlign="middle"
                        listening={false}
                    />
                </Group>
            )}

            {/* Outer Drop Shadow / Border */}
            <Circle radius={14 / stageScale} fill="transparent" stroke="rgba(255,255,255,0.8)" strokeWidth={2 / stageScale}
                shadowBlur={8} shadowColor="#000" shadowOpacity={0.5} listening={false} />
            {/* Pin Background Color based on role */}
            <Circle radius={13 / stageScale} fill={isTarget ? '#0ea5e9' : '#f59e0b'} opacity={0.9} listening={false} />
            {/* Number Text */}
            <KonvaText
                text={(index + 1).toString()}
                x={-14 / stageScale}
                y={-14 / stageScale}
                width={28 / stageScale}
                height={28 / stageScale}
                fontSize={14 / stageScale}
                fontFamily="Inter, sans-serif"
                fontStyle="bold"
                fill="#ffffff"
                align="center"
                verticalAlign="middle"
                listening={false}
            />

            {/* Invisible hit area for removal */}
            <Circle
                radius={24 / stageScale} fill="transparent"
                onClick={onRemove} onTap={onRemove}
            />
        </Group>
    );
}


// ---- Context menu state ----
interface CtxMenu { visible: boolean; x: number; y: number; layerId: string; }

// ---- Main component ----
export default function CanvasEditor() {
    const {
        layers, selectedLayerIds, activeTool, setActiveTool,
        selectLayers, updateLayer, addLayer, removeLayer,
        stageScale, stagePos, setStageScale, setStagePos,
        pins, addPin, removePin, clearPins, pinMode,
        setCanvasDimensions, getNextPlacement,
        duplicateLayer, copySelectedLayer, pasteAt, clipboard
    } = useCanvasStore();

    const stageRef = useRef<Konva.Stage>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [contextMenu, setContextMenu] = useState<CtxMenu>({ visible: false, x: 0, y: 0, layerId: '' });
    const [mounted, setMounted] = useState(false);
    const [isEditingResolution, setIsEditingResolution] = useState(false);
    const [isHoveringBadge, setIsHoveringBadge] = useState(false);
    const [resInputs, setResInputs] = useState({ width: '', height: '' });

    // Marquee Selection State
    const [selectionRect, setSelectionRect] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
    const [lines, setLines] = useState<any[]>([]); // Temp lines for brush tool
    const isSelecting = useRef(false);
    const isPanning = useRef(false);
    const isDrawing = useRef(false);

    useEffect(() => { setMounted(true); }, []);


    // Measure container
    useEffect(() => {
        const measure = () => {
            if (containerRef.current) {
                const w = containerRef.current.offsetWidth;
                const h = containerRef.current.offsetHeight;
                setDimensions({ width: w, height: h });
                setCanvasDimensions(w, h);
            }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [setCanvasDimensions]);

    const selectedLayers = layers.filter(l => selectedLayerIds.includes(l.id));
    const selectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;

    // Update Transformer nodes whenever selection changes
    const transformerRef = useRef<Konva.Transformer>(null);
    useEffect(() => {
        if (transformerRef.current) {
            const stage = transformerRef.current.getStage();
            if (!stage) return;
            const nodes = selectedLayerIds.map(id => stage.findOne('#' + id)).filter(Boolean) as Konva.Node[];
            transformerRef.current.nodes(nodes);
            transformerRef.current.getLayer()?.batchDraw();
        }
    }, [selectedLayerIds, layers]);

    // Context toolbar position

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                selectedLayerIds.forEach(id => removeLayer(id));
            }
            if (e.key === 'Escape') clearPins();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectedLayerIds, removeLayer, clearPins]);


    // Wheel zoom centered on cursor
    const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const oldScale = stageScale;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - stagePos.x) / oldScale,
            y: (pointer.y - stagePos.y) / oldScale,
        };

        const newScale = e.evt.deltaY > 0 ? oldScale / 1.2 : oldScale * 1.2;
        
        setStageScale(newScale);
        setStagePos({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        });
    }, [stageScale, stagePos, setStageScale, setStagePos]);

    // Stage interaction handlers
    const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage()!;
        const pos = stage.getRelativePointerPosition()!;

        // 1. Middle Click Pan
        if (e.evt.button === 1) {
            isPanning.current = true;
            return;
        }

        const clickedOnStage = e.target === stage || e.target.name() === 'bg';

        // 2. Marquee Selection start OR Stage Pan OR Deselect
        if (clickedOnStage) {
            if (activeTool === 'select' && e.evt.shiftKey) {
                isSelecting.current = true;
                setSelectionRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
                selectLayers([]);
            } else {
                isPanning.current = true;
                selectLayers([]); // Standard deselect
            }
            return;
        }

        // 3. Brush drawing start
        if (activeTool === 'brush') {
            const clickedLayer = [...layers].reverse().find((l) => {
                // Use stage coordinates directly for the hit test
                return pos.x >= l.x && pos.x <= l.x + l.width &&
                       pos.y >= l.y && pos.y <= l.y + l.height;
            });

            if (clickedLayer) {
                e.cancelBubble = true; // Stop dragging/selection
                isDrawing.current = true;
                selectLayers([clickedLayer.id]);
                setLines(prev => [...prev, { 
                    points: [pos.x, pos.y], 
                    stroke: 'rgba(14, 165, 233, 0.5)', 
                    strokeWidth: 30 / stageScale,
                    layerId: clickedLayer.id 
                }]);
            }
            return;
        }

        // 4. Pin placement
        if (activeTool === 'pin') {
            // Find layer under pointer (more robust than simple Rect check)
            const clickedLayer = [...layers].reverse().find((l) => {
                const node = stage.findOne('#' + l.id);
                if (!node) return false;
                // Simple hit test using Konva's built-in detection if possible, or refined bounds
                const transform = node.getAbsoluteTransform();
                const localPos = transform.copy().invert().point(stage.getPointerPosition()!);
                return localPos.x >= 0 && localPos.x <= node.width() && localPos.y >= 0 && localPos.y <= node.height();
            });

            if (clickedLayer) {
                e.evt.preventDefault();
                addPin({ layerId: clickedLayer.id, description: '' }, pos.x, pos.y);
                selectLayers([clickedLayer.id]);
            }
            return;
        }

        // 5. Single click selection (click on layer)
        const id = e.target.id();
        if (id && layers.some(l => l.id === id)) {
            if (e.evt.shiftKey || e.evt.ctrlKey) {
                useCanvasStore.getState().toggleLayerSelection(id);
            } else if (!selectedLayerIds.includes(id)) {
                selectLayers([id]);
            }
        }
    }, [activeTool, layers, addPin, selectLayers, selectedLayerIds, stageScale]);

    const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage()!;

        if (isPanning.current) {
            const oldPos = stagePos;
            setStagePos({
                x: oldPos.x + e.evt.movementX,
                y: oldPos.y + e.evt.movementY
            });
            return;
        }

        if (isSelecting.current && selectionRect) {
            const pos = stage.getRelativePointerPosition()!;
            setSelectionRect({ ...selectionRect, x2: pos.x, y2: pos.y });
        }

        if (isDrawing.current) {
            const pos = stage.getRelativePointerPosition()!;
            setLines(prev => {
                const newLines = [...prev];
                if (newLines.length === 0) return newLines;
                const lastLine = { ...newLines[newLines.length - 1] };
                lastLine.points = lastLine.points.concat([pos.x, pos.y]);
                newLines[newLines.length - 1] = lastLine;
                return newLines;
            });
        }
    }, [selectionRect, stagePos, setStagePos, activeTool]);

    const handleMouseUp = useCallback(() => {
        if (isPanning.current) {
            isPanning.current = false;
        }

        if (isDrawing.current) {
            isDrawing.current = false;
            // After drawing, we should trigger the removal logic
            // For now, we keep the lines visible. 
            // We'll add a "Confirm" or wait for a timeout to process the mask.
        }

        if (isSelecting.current && selectionRect) {
            isSelecting.current = false;
            
            // Find layers within the rectangle
            const x1 = Math.min(selectionRect.x1, selectionRect.x2);
            const y1 = Math.min(selectionRect.y1, selectionRect.y2);
            const x2 = Math.max(selectionRect.x1, selectionRect.x2);
            const y2 = Math.max(selectionRect.y1, selectionRect.y2);

            const newlySelected = layers.filter(l => {
                const lx = l.x, ly = l.y, lw = l.width, lh = l.height;
                return !(lx > x2 || lx + lw < x1 || ly > y2 || ly + lh < y1);
            }).map(l => l.id);

            selectLayers(newlySelected);
            setSelectionRect(null);
        }
    }, [selectionRect, layers, selectLayers, activeTool]);

    const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
        setContextMenu((c) => ({ ...c, visible: false }));
    }, []);

    const handleContextMenu = useCallback((e: Konva.KonvaEventObject<MouseEvent>, layerId?: string) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;

        // Force selection if right-clicking a layer
        if (layerId) {
            selectLayers([layerId]);
        }

        setContextMenu({
            visible: true,
            x: e.evt.clientX,
            y: e.evt.clientY,
            layerId: layerId || ''
        });
    }, [selectLayers]);

    const loadImageAndAdd = useCallback((src: string, name: string, offset = 0) => {
        const img = new window.Image();
        img.onload = () => {
            const currentLayers = useCanvasStore.getState().layers;
            const maxW = Math.min(600, dimensions.width * 0.5);
            const scale = img.width > maxW ? maxW / img.width : 1;
            const wScaled = (img.width * scale) / stageScale;
            const hScaled = (img.height * scale) / stageScale;

            // Get smart placement from store
            const placement = getNextPlacement(img.width * scale, img.height * scale);

            // Apply potential offset for batch paste
            const finalX = placement.x + (offset * (placement.width + (75 / stageScale)));

            addLayer({
                type: 'image',
                src,
                x: finalX,
                y: placement.y,
                width: placement.width,
                height: placement.height,
                naturalWidth: img.width,
                naturalHeight: img.height,
                rotation: 0,
                name,
                visible: true,
                locked: false,
            });
        };
        img.src = src;
    }, [addLayer, dimensions.width, getNextPlacement, stageScale]);

    // Drag-and-drop file upload
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
        files.forEach((file, i) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const src = ev.target?.result as string;
                loadImageAndAdd(src, file.name, i);
            };
            reader.readAsDataURL(file);
        });
    }, [addLayer, layers, loadImageAndAdd]);

    // Expose mask export for AI use
    useEffect(() => {
        (window as any).__canvasLoadImage = loadImageAndAdd;
        
        const exportMask = async (layerId: string) => {
            const layer = useCanvasStore.getState().layers.find(l => l.id === layerId);
            if (!layer) return null;

            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = layer.naturalWidth || layer.width;
            maskCanvas.height = layer.naturalHeight || layer.height;
            const ctx = maskCanvas.getContext('2d')!;

            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

            const scaleX = (layer.naturalWidth || layer.width) / layer.width;
            const scaleY = (layer.naturalHeight || layer.height) / layer.height;

            // Use the lines from state at the time of calling
            const currentLines = lines; 
            const layerLines = currentLines.filter(l => l.layerId === layerId);
            
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'white';
            
            layerLines.forEach(line => {
                ctx.lineWidth = line.strokeWidth * scaleX;
                ctx.beginPath();
                for (let i = 0; i < line.points.length; i += 2) {
                    const localX = (line.points[i] - layer.x) * scaleX;
                    const localY = (line.points[i+1] - layer.y) * scaleY;
                    if (i === 0) ctx.moveTo(localX, localY);
                    else ctx.lineTo(localX, localY);
                }
                ctx.stroke();
            });

            const maskData = maskCanvas.toDataURL('image/png');
            setLines([]); 
            return maskData;
        };

        (window as any).__canvasExportBrushMask = exportMask;
        
        return () => {
             // We don't want to clear it on every lines change, but this effect
             // needs to see the latest 'lines' if we close over it.
             // Actually, it's safer to use a ref for lines or just keep it as is
             // but ensure it's always assigned.
        };
    }, [loadImageAndAdd, layers, lines]);

    // Paste from clipboard
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            const src = ev.target?.result as string;
                            loadImageAndAdd(src, `Pasted Image`);
                        };
                        reader.readAsDataURL(blob);
                    }
                    e.preventDefault(); // Stop default paste behavior if we handled an image
                    break;
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [loadImageAndAdd]);


    if (!mounted) return <div className="canvas-container" ref={containerRef} />;

    // Pin mode label
    const pinModeLabel = pinMode === 'edit'
        ? '📍 1 Pinezka — Edycja punktu'
        : pinMode === 'adjust'
            ? '📍📍 2 Pinezki — Dostosowanie'
            : pinMode === 'transfer'
                ? '🔀 Dwie warstwy — Transfer elementu'
                : null;

    const handleStageContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;
        
        // If clicking on layer, it's handled by layer. If clicking on stage, handle here.
        if (e.target === stage || e.target.name() === 'bg') {
            handleContextMenu(e as any, '');
        }
    };

    const handleExport = () => {
        if (!stageRef.current) return;
        const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = `canvas-project-${Date.now()}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div
            className="canvas-container"
            ref={containerRef}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
        >

            <TextEditorModal />

            {/* Konva Stage */}
            {dimensions.width > 0 && (
                <Stage
                    ref={stageRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    scaleX={stageScale}
                    scaleY={stageScale}
                    x={stagePos.x}
                    y={stagePos.y}
                    draggable={false} // Managed via custom isPanning logic for better control
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    onContextMenu={handleStageContextMenu}
                    onClick={handleStageClick}
                    style={{
                        cursor: activeTool === 'move'
                            ? 'grab'
                            : (activeTool === 'pin' || activeTool === 'brush')
                                ? 'crosshair'
                                : 'default',
                    }}
                >
                    <Layer>
                        {/* Selection Rect */}
                        {selectionRect && (
                            <Rect
                                x={Math.min(selectionRect.x1, selectionRect.x2)}
                                y={Math.min(selectionRect.y1, selectionRect.y2)}
                                width={Math.abs(selectionRect.x2 - selectionRect.x1)}
                                height={Math.abs(selectionRect.y2 - selectionRect.y2)}
                                fill="rgba(14, 165, 233, 0.1)"
                                stroke="#0ea5e9"
                                strokeWidth={1 / stageScale}
                                dash={[5 / stageScale, 5 / stageScale]}
                            />
                        )}

                        {/* Image layers */}
                        {layers.map((layer) => {
                            if (layer.type === 'image') {
                                return (
                                    <ImageLayerNode
                                        key={layer.id}
                                        layer={layer}
                                        isSelected={selectedLayerIds.includes(layer.id)}
                                        activeTool={activeTool}
                                        onSelect={() => selectLayers([layer.id])}
                                        onChange={(attrs) => updateLayer(layer.id, attrs)}
                                        onContextMenu={(e) => handleContextMenu(e, layer.id)}
                                    />
                                );
                            }
                            return null;
                        })}

                        {/* Pin markers */}
                        {pins.map((pin, index) => {
                            const layer = layers.find(l => l.id === pin.layerId);
                            if (!layer) return null;
                            return (
                                <PinMarkerNode
                                    key={pin.id}
                                    pin={pin}
                                    index={index}
                                    layer={layer}
                                    stageScale={stageScale}
                                    onRemove={() => removePin(pin.id)}
                                    onDescriptionChange={(desc) => useCanvasStore.getState().updatePinDescription(pin.id, desc)}
                                />
                            );
                        })}

                        {/* Brush Lines */}
                        {lines.map((line, i) => (
                            <Line
                                key={i}
                                points={line.points}
                                stroke={line.stroke}
                                strokeWidth={line.strokeWidth}
                                tension={0.5}
                                lineCap="round"
                                lineJoin="round"
                                globalCompositeOperation="source-over"
                            />
                        ))}

                        <Transformer
                            ref={transformerRef}
                            boundBoxFunc={(oldBox, newBox) =>
                                newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
                            }
                            borderStroke="#0ea5e9"
                            borderStrokeWidth={2}
                            anchorStroke="#0ea5e9"
                            anchorFill="#0284c7"
                            anchorSize={10}
                            rotateEnabled={true}
                            enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']}
                            onTransform={(e) => {
                                // Keep the scale during transformation for smooth Konva calculation.
                                // Don't reset scaleX/scaleY here as it causes jitter.
                            }}
                            onTransformEnd={(e) => {
                                const tr = (e.target as unknown) as Konva.Transformer;
                                const nodes = tr.nodes();
                                nodes.forEach(node => {
                                    const id = node.id();
                                    const scaleX = node.scaleX();
                                    const scaleY = node.scaleY();
                                    
                                    // Calculate final physical dimensions
                                    const newWidth = Math.max(5, node.width() * scaleX);
                                    const newHeight = Math.max(5, node.height() * scaleY);
                                    
                                    // Reset node state before updating store
                                    node.scaleX(1);
                                    node.scaleY(1);
                                    node.width(newWidth);
                                    node.height(newHeight);

                                    updateLayer(id, {
                                        x: node.x(),
                                        y: node.y(),
                                        width: newWidth,
                                        height: newHeight,
                                        rotation: node.rotation()
                                    });
                                });
                                tr.getLayer()?.batchDraw();
                            }}
                        />
                    </Layer>
                </Stage>
            )}

            {/* Image info badge — above top-left of selected image */}
            {selectedLayer && (
                <div
                    className={`image-info-badge ${isEditingResolution ? 'editing' : ''}`}
                    style={{
                        left: selectedLayer.x * stageScale + stagePos.x,
                        top: selectedLayer.y * stageScale + stagePos.y - 12
                    }}
                    onMouseEnter={() => setIsHoveringBadge(true)}
                    onMouseLeave={() => {
                        setIsHoveringBadge(false);
                        // Only close if user isn't currently typing/focusing
                        if (isEditingResolution && document.activeElement?.tagName !== 'INPUT') {
                            setIsEditingResolution(false);
                        }
                    }}
                >
                    <span className="info-badge-label">🖼 {selectedLayer.name}</span>
                    <div
                        className="info-badge-size"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!isEditingResolution) {
                                setResInputs({
                                    width: Math.round(selectedLayer.width).toString(),
                                    height: Math.round(selectedLayer.height).toString()
                                });
                                setIsEditingResolution(true);
                            }
                        }}
                    >
                        {isEditingResolution ? (
                            <div className="res-editor">
                                <input
                                    type="text"
                                    className="res-input"
                                    value={resInputs.width}
                                    onChange={(e) => setResInputs({ ...resInputs, width: e.target.value })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') {
                                            const w = parseInt(resInputs.width);
                                            const h = parseInt(resInputs.height);
                                            if (!isNaN(w) && !isNaN(h)) {
                                                updateLayer(selectedLayer.id, { width: w, height: h });
                                                setIsEditingResolution(false);
                                            }
                                        }
                                        if (e.key === 'Escape') setIsEditingResolution(false);
                                    }}
                                    autoFocus
                                />
                                <span className="res-sep">×</span>
                                <input
                                    type="text"
                                    className="res-input"
                                    value={resInputs.height}
                                    onChange={(e) => setResInputs({ ...resInputs, height: e.target.value })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') {
                                            const w = parseInt(resInputs.width);
                                            const h = parseInt(resInputs.height);
                                            if (!isNaN(w) && !isNaN(h)) {
                                                updateLayer(selectedLayer.id, { width: w, height: h });
                                                setIsEditingResolution(false);
                                            }
                                        }
                                        if (e.key === 'Escape') setIsEditingResolution(false);
                                    }}
                                />
                            </div>
                        ) : (
                            <span className="res-text-clickable">
                                {Math.round(selectedLayer.width)} × {Math.round(selectedLayer.height)}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Pin Description Input (for unconfirmed pins) */}
            {pins.filter(p => !p.confirmed).map(pin => {
                const layer = layers.find(l => l.id === pin.layerId);
                if (!layer) return null;
                const px = layer.x * stageScale + pin.normalizedX * layer.width * stageScale + stagePos.x;
                const py = layer.y * stageScale + pin.normalizedY * layer.height * stageScale + stagePos.y;
                
                const pinIndex = pins.findIndex(p => p.id === pin.id);
                const isTarget = pinIndex === 0;
                const role = isTarget ? 'TARGET (CEL)' : 'SOURCE (ŹRÓDŁO)';
                const roleClass = isTarget ? 'cel' : 'zrodlo';

                return (
                    <div
                        key={pin.id}
                        className="pin-description-popover"
                        style={{ left: px + 24, top: py - 20 }}
                    >
                        <div className={`pin-popover-inner ${roleClass}`}>
                            <div className="pin-suggestions-header">
                                <span className={`pin-header-dot ${roleClass}`} />
                                PINEZKA {pinIndex + 1}: {role}
                            </div>

                            {pin.suggestions && pin.suggestions.length > 0 && (
                                <div className="pin-suggestions-list">
                                    {pin.suggestions.map((suggestion, idx) => (
                                        <button
                                            key={idx}
                                            className="pin-suggestion-item"
                                            onClick={() => {
                                                useCanvasStore.getState().updatePinDescription(pin.id, suggestion);
                                                useCanvasStore.getState().confirmPin(pin.id);
                                            }}
                                        >
                                            <div className="suggestion-thumb">
                                                <img src={layer.src} alt="" style={{
                                                    objectFit: 'cover',
                                                    width: '100%',
                                                    height: '100%',
                                                    transform: `scale(2) translate(${-(pin.normalizedX - 0.5) * 100}%, ${-(pin.normalizedY - 0.5) * 100}%)`
                                                }} />
                                            </div>
                                            <span className="suggestion-text">{suggestion}</span>
                                            {pin.description === suggestion && <span className="suggestion-check">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="pin-input-row">
                                <div className="pin-input-icon">📍</div>
                                <input
                                    className="pin-desc-input"
                                    placeholder="Opisz co tu jest..."
                                    value={pin.description || ''}
                                    onChange={(e) => useCanvasStore.getState().updatePinDescription(pin.id, e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') useCanvasStore.getState().confirmPin(pin.id);
                                    }}
                                    autoFocus={!pin.suggestions || pin.suggestions.length === 0}
                                />
                                <button
                                    className="pin-confirm-btn"
                                    onClick={() => useCanvasStore.getState().confirmPin(pin.id)}
                                    title="Zatwierdź"
                                >
                                    ✓
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}


            {/* Brush mode banner */}
            {activeTool === 'brush' && (
                <div className="mode-banner brush animate-in slide-in-from-bottom duration-300">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <span className="font-bold text-sm">
                                {useCanvasStore.getState().brushMode === 'text-edit' ? '✍️ Edycja Tekstu' : '🧽 Magic Eraser'}
                            </span>
                            <span className="text-[10px] opacity-60 uppercase tracking-wider">Zamaluj obszar na zdjęciu</span>
                        </div>
                        <div className="flex gap-2 ml-4">
                            <button className="btn-confirm" onClick={() => (window as any).__canvasPulseBrushConfirm?.()}>
                                <Check size={14} /> Confirm
                            </button>
                            <button className="btn-cancel" onClick={() => setActiveTool('select')}>
                                <X size={14} /> Anuluj
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pin mode indicator */}
            {pinModeLabel && activeTool === 'pin' && (
                <div className="mode-banner">
                    <span>{pinModeLabel}</span>
                    <span className="mode-banner-hint">Opisz akcję w czacie → Wyślij</span>
                    <button onClick={() => clearPins()}>✕ Anuluj</button>
                </div>
            )}

            {/* Zoom indicator */}
            <div className="zoom-indicator">{Math.round(stageScale * 100)}%</div>

            <style dangerouslySetInnerHTML={{ __html: UI_STYLES }} />

            {/* Context Toolbar removed per user request */}

            {/* Right-Click Context Menu */}
            {contextMenu.visible && (
                <div 
                    className="fixed z-[9999] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-1.5 min-w-[200px] backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    {contextMenu.layerId ? (
                        <>
                            <button className="ctx-menu-item" onClick={() => { duplicateLayer(contextMenu.layerId); setContextMenu(p => ({...p, visible: false})) }}>
                                <Files size={16} /> <span>Duplikuj</span>
                            </button>
                            <button className="ctx-menu-item" onClick={() => { copySelectedLayer(); setContextMenu(p => ({...p, visible: false})) }}>
                                <Copy size={16} /> <span>Kopiuj</span>
                            </button>
                            <button className="ctx-menu-item" onClick={() => { useCanvasStore.getState().moveLayerUp(contextMenu.layerId); setContextMenu(p => ({...p, visible: false})) }}>
                                <ArrowUp size={16} /> <span>Przesuń wyżej</span>
                            </button>
                            <button className="ctx-menu-item" onClick={() => { useCanvasStore.getState().moveLayerDown(contextMenu.layerId); setContextMenu(p => ({...p, visible: false})) }}>
                                <ArrowDown size={16} /> <span>Przesuń niżej</span>
                            </button>
                            <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1 mx-1.5" />
                            <button className="ctx-menu-item text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => { removeLayer(contextMenu.layerId); setContextMenu(p => ({...p, visible: false})) }}>
                                <Trash2 size={15} /> Usuń
                            </button>
                        </>
                    ) : (
                        <>
                            <button 
                                className={`ctx-menu-item ${!clipboard ? 'opacity-30 cursor-not-allowed' : ''}`} 
                                onClick={() => { 
                                    const stage = stageRef.current;
                                    if (stage) {
                                        const pos = stage.getRelativePointerPosition();
                                        if (pos) pasteAt(pos.x, pos.y);
                                    }
                                    setContextMenu(p => ({...p, visible: false}));
                                }}
                                disabled={!clipboard}
                            >
                                <Check size={16} /> <span>Wklej</span>
                            </button>
                            <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1 mx-1.5" />
                            <button className="ctx-menu-item" onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*';
                                input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => loadImageAndAdd(ev.target?.result as string, file.name);
                                        reader.readAsDataURL(file);
                                    }
                                };
                                input.click();
                                setContextMenu(p => ({...p, visible: false}));
                            }}>
                                <Upload size={15} /> Importuj obraz
                            </button>
                            <button className="ctx-menu-item" onClick={() => { handleExport(); setContextMenu(p => ({...p, visible: false})) }}>
                                <Download size={15} /> Eksportuj projekt
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
