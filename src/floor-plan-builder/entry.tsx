import { lazy, Suspense, useLayoutEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

const StudioPage = lazy(() => import('./components/StudioPage.tsx'));
const BoothPreview = import.meta.env.DEV
  ? lazy(() => import('./components/BoothPreview.tsx'))
  : null;
const CirculationPreview = import.meta.env.DEV
  ? lazy(() => import('./components/CirculationPreview.tsx'))
  : null;
const StructurePreview = import.meta.env.DEV
  ? lazy(() => import('./components/StructurePreview.tsx'))
  : null;
const AmenityPreview = import.meta.env.DEV
  ? lazy(() => import('./components/AmenityPreview.tsx'))
  : null;
const ServicePreview = import.meta.env.DEV
  ? lazy(() => import('./components/ServicePreview.tsx'))
  : null;
export function isFloorPlanPath(path: string): boolean {
  return /^(?:\/floorplan)?\/admin\/floor-plan\/?$/.test(path);
}
export function FloorPlanEntry() {
  useLayoutEffect(() => {
    const root = document.documentElement,
      wasDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!wasDark) {
        root.classList.remove('dark');
      }
    };
  }, []);
  return (
    <TooltipProvider delayDuration={200}>
      <Suspense
        fallback={
          <p className="p-6" role="status">
            Opening floor plan studio…
          </p>
        }
      >
        {CirculationPreview && new URLSearchParams(location.search).has('circulationPreview') ? (
          <CirculationPreview />
        ) : StructurePreview && new URLSearchParams(location.search).has('structurePreview') ? (
          <StructurePreview />
        ) : AmenityPreview && new URLSearchParams(location.search).has('amenityPreview') ? (
          <AmenityPreview />
        ) : ServicePreview && new URLSearchParams(location.search).has('servicePreview') ? (
          <ServicePreview />
        ) : BoothPreview && new URLSearchParams(location.search).has('boothPreview') ? (
          <BoothPreview />
        ) : (
          <StudioPage />
        )}
      </Suspense>
    </TooltipProvider>
  );
}
