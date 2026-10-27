import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import { FloorPlanEntry } from '@/floor-plan-builder/entry.tsx';

/** Mount the app. Renders a visible fallback instead of throwing when #root is missing. */
function mount(): void {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    document.body.innerHTML = '<p role="alert">Missing #root element. The app cannot start.</p>';
    return;
  }

  createRoot(rootEl).render(
    <StrictMode>
      <FloorPlanEntry />
    </StrictMode>,
  );
}

mount();
