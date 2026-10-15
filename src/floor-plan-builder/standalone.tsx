import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import { FloorPlanEntry } from './entry.tsx';

const element = document.getElementById('root');
if (element) {
  createRoot(element).render(
    <StrictMode>
      <FloorPlanEntry />
    </StrictMode>,
  );
}
