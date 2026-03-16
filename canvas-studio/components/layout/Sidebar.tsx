import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Layers, Users, Eraser, Camera, Settings, Brush, Maximize, Sun, ChevronRight, ChevronLeft, Library, Sparkles } from 'lucide-react';

export default function Sidebar() {
    const location = useLocation();
    const pathname = location.pathname;
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleSidebar = () => setIsExpanded(!isExpanded);

    return (
        <aside className={`sidebar ${isExpanded ? 'expanded' : ''}`}>
            <div className="sidebar-top">
                <Link to="/" className="sidebar-logo-wrapper" title="NextART">
                    <div className="sidebar-logo-container">
                        <img src="/n-logo.png" alt="App Logo" className="sidebar-logo-img" />
                    </div>
                    <span className="logo-text">NextART</span>
                </Link>

                <Link to="/" className={`sidebar-btn ${pathname === '/' ? 'active' : ''}`} title="Studio Zdjęć (Home)">
                    <Camera size={22} />
                    <span className="sidebar-label">Studio Zdjęć</span>
                </Link>
                <Link to="/canvas" className={`sidebar-btn ${pathname === '/canvas' ? 'active' : ''}`} title="Canvas Editor">
                    <Layers size={22} />
                    <span className="sidebar-label">Canvas Editor</span>
                </Link>
                <Link to="/inpaint" className={`sidebar-btn ${pathname === '/inpaint' ? 'active' : ''}`} title="Inpaint (Usuwanie elementów)">
                    <Brush size={22} />
                    <span className="sidebar-label">Inpaint</span>
                </Link>
                <Link to="/remove-bg" className={`sidebar-btn ${pathname === '/remove-bg' ? 'active' : ''}`} title="Usuń Tło">
                    <Eraser size={22} />
                    <span className="sidebar-label">Usuń Tło</span>
                </Link>
                <Link to="/outpaint" className={`sidebar-btn ${pathname === '/outpaint' ? 'active' : ''}`} title="Outpaint (Rozszerzanie)">
                    <Maximize size={22} />
                    <span className="sidebar-label">Outpaint</span>
                </Link>
                <Link to="/relight" className={`sidebar-btn ${pathname === '/relight' ? 'active' : ''}`} title="Relight (Oświetlenie)">
                    <Sun size={22} />
                    <span className="sidebar-label">Relight</span>
                </Link>
                <Link to="/swap" className={`sidebar-btn ${pathname === '/swap' ? 'active' : ''}`} title="Character Swap">
                    <Users size={22} />
                    <span className="sidebar-label">Character Swap</span>
                </Link>
                <Link to="/fusion" className={`sidebar-btn ${pathname === '/fusion' ? 'active' : ''}`} title="Postać & Sceneria (Fuzja)">
                    <Sparkles size={22} />
                    <span className="sidebar-label">Postać & Sceneria</span>
                </Link>
                <div style={{ margin: '12px 0', height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                <Link to="/library" className={`sidebar-btn ${pathname === '/library' ? 'active' : ''}`} title="Biblioteka (Twoje zdjęcia)">
                    <Library size={22} />
                    <span className="sidebar-label">Biblioteka</span>
                </Link>

                <div className="sidebar-bottom-divider" />

                <button
                    className="sidebar-toggle-mini"
                    onClick={toggleSidebar}
                    title={isExpanded ? "Zwiń" : "Rozwiń"}
                >
                    {isExpanded ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>
            </div>
            <div className="sidebar-bottom">
                <button className="sidebar-btn" title="Ustawienia">
                    <Settings size={22} />
                    <span className="sidebar-label">Ustawienia</span>
                </button>
            </div>
        </aside>
    );
}
