import { create } from 'zustand';
import { persist, StateStorage, createJSONStorage } from 'zustand/middleware';

const idbStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        if (typeof window === 'undefined') return null;
        return new Promise((resolve) => {
            const request = indexedDB.open('nextart-db', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('keyval');
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('keyval', 'readonly');
                const store = tx.objectStore('keyval');
                const getReq = store.get(name);
                getReq.onsuccess = () => resolve(getReq.result || null);
                getReq.onerror = () => resolve(null);
            };
            request.onerror = () => resolve(null);
        });
    },
    setItem: async (name: string, value: string): Promise<void> => {
        if (typeof window === 'undefined') return;
        return new Promise((resolve) => {
            const request = indexedDB.open('nextart-db', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('keyval');
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('keyval', 'readwrite');
                const store = tx.objectStore('keyval');
                store.put(value, name);
                tx.oncomplete = () => resolve();
            };
            request.onerror = () => resolve();
        });
    },
    removeItem: async (name: string): Promise<void> => {
        if (typeof window === 'undefined') return;
        return new Promise((resolve) => {
            const request = indexedDB.open('nextart-db', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('keyval');
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('keyval', 'readwrite');
                const store = tx.objectStore('keyval');
                store.delete(name);
                tx.oncomplete = () => resolve();
            };
            request.onerror = () => resolve();
        });
    },
};

export type ToolType = 'outpaint' | 'relight' | 'remove-bg' | 'canvas' | 'swap' | 'inpaint';

export interface LibraryItem {
    id: string;
    url: string;
    originalUrl?: string;
    prompt?: string;
    tool: ToolType;
    timestamp: number;
}

interface LibraryState {
    items: LibraryItem[];
    addItem: (item: Omit<LibraryItem, 'id' | 'timestamp'>) => void;
    removeItem: (id: string) => void;
    clearLibrary: () => void;
}

export const useLibraryStore = create<LibraryState>()(
    persist(
        (set) => ({
            items: [],
            addItem: (item) => set((state) => ({
                items: [
                    {
                        ...item,
                        id: Math.random().toString(36).substring(2, 11),
                        timestamp: Date.now(),
                    },
                    ...state.items
                ].slice(0, 50) // Limit to 50 items to keep localStorage manageable
            })),
            removeItem: (id) => set((state) => ({
                items: state.items.filter((i) => i.id !== id)
            })),
            clearLibrary: () => set({ items: [] }),
        }),
        {
            name: 'nextart-library-storage',
            storage: createJSONStorage(() => idbStorage),
        }
    )
);
