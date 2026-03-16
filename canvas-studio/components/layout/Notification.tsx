'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface NotificationProps {
    message: string;
    isVisible: boolean;
    onClose: () => void;
}

export default function Notification({ message, isVisible, onClose }: NotificationProps) {
    const [shouldRender, setShouldRender] = useState(isVisible);

    useEffect(() => {
        if (isVisible) {
            setShouldRender(true);
            const timer = setTimeout(() => {
                onClose();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);

    if (!isVisible && !shouldRender) return null;

    return (
        <div
            className={`fixed bottom-8 right-8 z-[2000] flex items-center gap-3 bg-[#12121c] border border-white/10 px-4 py-3 rounded-2xl shadow-2xl transition-all duration-300 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
            style={{
                backdropFilter: 'blur(20px)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
            }}
        >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 text-green-500">
                <CheckCircle2 size={18} />
            </div>
            <div className="flex flex-col">
                <span className="text-white text-sm font-semibold">Sukces</span>
                <span className="text-white/60 text-xs">{message}</span>
            </div>
            <button
                onClick={onClose}
                className="ml-4 text-white/40 hover:text-white transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
}
