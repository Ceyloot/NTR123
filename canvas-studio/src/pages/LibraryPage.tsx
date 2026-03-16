import React, { useState } from 'react';
import {
    Library,
    Trash2,
    Download,
    Copy,
    Image as ImageIcon,
    Scissors,
    Brush,
    Maximize,
    Sun,
    Search,
    Filter,
    ExternalLink,
    Clock,
    Grid,
    List as ListIcon
} from 'lucide-react';
import { useLibraryStore, ToolType } from '@/store/libraryStore';

const TOOL_METADATA: Record<ToolType | 'all', { label: string; icon: any; color: string }> = {
    all: { label: 'Wszystkie', icon: Grid, color: 'var(--accent)' },
    'remove-bg': { label: 'Usuwanie Tła', icon: Scissors, color: '#3b82f6' },
    'outpaint': { label: 'Outpaint', icon: Maximize, color: '#10b981' },
    'relight': { label: 'Relight', icon: Sun, color: '#f59e0b' },
    'canvas': { label: 'Canvas', icon: ImageIcon, color: '#8b5cf6' },
    'swap': { label: 'Character Swap', icon: Library, color: '#ec4899' },
    'inpaint': { label: 'Inpaint', icon: Brush, color: '#f87171' }
};

export default function LibraryPage() {
    const { items, removeItem, clearLibrary } = useLibraryStore();
    const [filter, setFilter] = useState<ToolType | 'all'>('all');
    const [search, setSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState<any>(null);

    const filteredItems = items.filter(item => {
        const matchesFilter = filter === 'all' || item.tool === filter;
        const matchesSearch = item.prompt?.toLowerCase().includes(search.toLowerCase()) ||
            item.tool.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const handleCopy = async (url: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const item = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([item]);
            alert("Skopiowano do schowka!");
        } catch (err) {
            console.error(err);
            alert("Błąd kopiowania.");
        }
    };

    return (
        <main className="canvas-main" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>
            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-header-icon">
                        <Library size={20} />
                    </div>
                    <div className="app-header-info">
                        <h1>Biblioteka</h1>
                        <p>Twoje wszystkie wygenerowane projekty</p>
                    </div>
                </div>

                <div className="app-header-right">
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Szukaj..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    padding: '8px 12px 8px 34px',
                                    fontSize: '13px',
                                    color: 'white',
                                    outline: 'none',
                                    width: '200px'
                                }}
                            />
                        </div>
                        {items.length > 0 && (
                            <button
                                onClick={() => confirm("Czy na pewno wyczyścić całą bibliotekę?") && clearLibrary()}
                                className="lightbox-btn"
                                style={{ color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                            >
                                <Trash2 size={14} />
                                <span>Wyczyść wszystko</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
                {/* Filters Row */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
                    {(Object.keys(TOOL_METADATA) as (ToolType | 'all')[]).map(key => {
                        const meta = TOOL_METADATA[key];
                        const Icon = meta.icon;
                        const isActive = filter === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setFilter(key)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 16px', borderRadius: '12px',
                                    background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                                    color: isActive ? 'white' : 'var(--text-muted)',
                                    border: '1px solid',
                                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                                    fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Icon size={14} />
                                {meta.label}
                            </button>
                        );
                    })}
                </div>

                {filteredItems.length === 0 ? (
                    <div style={{ height: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <ImageIcon size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
                        <p>Brak zdjęć w tej kategorii</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
                        {filteredItems.map(item => {
                            const meta = TOOL_METADATA[item.tool as ToolType] || TOOL_METADATA.all;
                            return (
                                <div
                                    key={item.id}
                                    className="library-item-card group"
                                    style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '20px',
                                        overflow: 'hidden',
                                        transition: 'all 0.3s',
                                        position: 'relative'
                                    }}
                                >
                                    <div
                                        onClick={() => setSelectedItem(item)}
                                        style={{
                                            height: '240px', background: 'rgba(0,0,0,0.2)',
                                            position: 'relative', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <img
                                            src={item.url}
                                            alt={item.prompt || 'Generated'}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <div className="library-card-overlay" style={{
                                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                                            opacity: 0, transition: 'opacity 0.2s',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <ExternalLink size={24} color="white" />
                                        </div>

                                        <div style={{
                                            position: 'absolute', top: '12px', left: '12px',
                                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                                            padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                                            display: 'flex', alignItems: 'center', gap: '6px'
                                        }}>
                                            <meta.icon size={12} style={{ color: meta.color }} />
                                            <span style={{ fontSize: '10px', color: 'white', fontWeight: 600, textTransform: 'uppercase' }}>{meta.label}</span>
                                        </div>
                                    </div>

                                    <div style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>
                                                <Clock size={12} />
                                                {new Date(item.timestamp).toLocaleDateString('pl-PL')}
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    onClick={() => removeItem(item.id)}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                                                    title="Usuń"
                                                >
                                                    <Trash2 size={14} className="hover:text-red-500" />
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => handleCopy(item.url)}
                                                className="lightbox-btn"
                                                style={{ flex: 1, padding: '6px', fontSize: '12px' }}
                                            >
                                                <Copy size={13} /> Kopiuj
                                            </button>
                                            <a
                                                href={item.url}
                                                download={`nextart-${item.tool}-${item.id}.png`}
                                                className="lightbox-btn primary"
                                                style={{ flex: 1, padding: '6px', fontSize: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <Download size={13} /> Zapisz
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Lightbox */}
            {selectedItem && (
                <div className="studio-lightbox animate-fade-in" onClick={() => setSelectedItem(null)} style={{ zIndex: 1000, background: 'rgba(0,0,0,0.95)' }}>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()} style={{ background: 'transparent', border: 'none', padding: 0 }}>
                        <button className="lightbox-close" onClick={() => setSelectedItem(null)} style={{ top: '-40px' }}>✕</button>
                        <img src={selectedItem.url} alt="Full view" className="lightbox-img" style={{ maxHeight: '85vh', borderRadius: '12px' }} />
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ background: '#12121c', border: '1px solid rgba(255,255,255,0.05)', padding: '16px 24px', borderRadius: '20px', display: 'flex', gap: '24px', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Narzędzie</span>
                                    <span style={{ fontSize: '14px', color: 'white', fontWeight: 600 }}>{TOOL_METADATA[selectedItem.tool as ToolType]?.label || 'Unknown'}</span>
                                </div>
                                <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.1)' }} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Data</span>
                                    <span style={{ fontSize: '14px', color: 'white', fontWeight: 600 }}>{new Date(selectedItem.timestamp).toLocaleString('pl-PL')}</span>
                                </div>
                                <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.1)' }} />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleCopy(selectedItem.url)} className="lightbox-btn" style={{ height: '40px' }}><Copy size={16} /> Kopiuj</button>
                                    <a href={selectedItem.url} download className="lightbox-btn primary" style={{ height: '40px', textDecoration: 'none' }}><Download size={16} /> Pobierz oryginał</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .group:hover .library-card-overlay {
                    opacity: 1 !important;
                }
                .library-item-card:hover {
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    border-color: rgba(255,255,255,0.1) !important;
                }
            ` }} />
        </main>
    );
}
