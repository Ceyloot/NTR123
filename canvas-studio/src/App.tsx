import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import StudioPage from '@/src/pages/StudioPage';
import InpaintPage from '@/src/pages/InpaintPage';
import OutpaintPage from '@/src/pages/OutpaintPage';
import RelightPage from '@/src/pages/RelightPage';
import RemoveBgPage from '@/src/pages/RemoveBgPage';
import SwapPage from '@/src/pages/SwapPage';
import LibraryPage from '@/src/pages/LibraryPage';
import CanvasPage from '@/src/pages/CanvasPage';
import FusionPage from '@/src/pages/FusionPage';

const App: React.FC = () => {
    return (
        <div className="app-root">
            <Sidebar />
            <Routes>
                <Route path="/" element={<StudioPage />} />
                <Route path="/inpaint" element={<InpaintPage />} />
                <Route path="/outpaint" element={<OutpaintPage />} />
                <Route path="/relight" element={<RelightPage />} />
                <Route path="/remove-bg" element={<RemoveBgPage />} />
                <Route path="/swap" element={<SwapPage />} />
                <Route path="/fusion" element={<FusionPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/canvas" element={<CanvasPage />} />
                {/* Add more routes here */}
            </Routes>
        </div>
    );
};

export default App;
