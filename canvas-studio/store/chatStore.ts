import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type ModelType = 'runware';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    imageUrl?: string;
    timestamp: Date;
    model?: string;
    isLoading?: boolean;
    pins?: {
        layerId: string;
        description?: string;
        imageSnapshot?: string; // Base64 of the area around the pin
    }[];
}

interface ChatState {
    messages: ChatMessage[];
    selectedModel: ModelType;
    isLoading: boolean;
    attachedImageUrl: string | null;
    apiKeys: {
        runware: string;
        gemini: string;
    };
    showSettings: boolean;
    swapVariant: 'local' | 'full-body';

    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    removeMessage: (id: string) => void;
    clearMessages: () => void;
    setSelectedModel: (model: ModelType) => void;
    setLoading: (v: boolean) => void;
    setAttachedImage: (url: string | null) => void;
    setApiKey: (key: 'runware' | 'gemini', value: string) => void;
    setSwapVariant: (variant: 'local' | 'full-body') => void;
    setShowSettings: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
    messages: [],
    selectedModel: 'runware',
    isLoading: false,
    attachedImageUrl: null,
    apiKeys: {
        runware: import.meta.env.VITE_RUNWARE_API_KEY || '',
        gemini: import.meta.env.VITE_GEMINI_API_KEY || '',
    },
    showSettings: false,
    swapVariant: 'local',

    addMessage: (msg) => {
        const id = uuidv4();
        set((s) => ({
            messages: [...s.messages, { ...msg, id, timestamp: new Date() }],
        }));
        return id;
    },

    updateMessage: (id, updates) =>
        set((s) => ({
            messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        })),

    removeMessage: (id) =>
        set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

    clearMessages: () => set({ messages: [] }),

    setSelectedModel: (model) => set({ selectedModel: model }),

    setLoading: (v) => set({ isLoading: v }),

    setAttachedImage: (url) => set({ attachedImageUrl: url }),

    setApiKey: (key, value) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [key]: value } })),

    setSwapVariant: (variant) => set({ swapVariant: variant }),

    setShowSettings: (v) => set({ showSettings: v }),
}));
