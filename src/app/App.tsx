import { useState } from 'react';
import { WorldPage } from '../pages/world-page/WorldPage.tsx';
import { AdminBuilderPage } from '../pages/admin-builder-page/AdminBuilderPage.tsx';

export function App() {
  const [mode, setMode] = useState<'world' | 'admin'>('world');

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
        <h1 className="text-sm font-bold">Spatial Venue 3D</h1>
        <nav className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('world');
            }}
            className={`rounded-full px-3 py-1 ${mode === 'world' ? 'bg-white text-black' : 'bg-white/10'}`}
          >
            3D World
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('admin');
            }}
            className={`rounded-full px-3 py-1 ${mode === 'admin' ? 'bg-white text-black' : 'bg-white/10'}`}
          >
            Admin builder
          </button>
        </nav>
      </header>
      {mode === 'world' ? <WorldPage /> : <AdminBuilderPage />}
    </div>
  );
}
