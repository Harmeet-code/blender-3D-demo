import { lazy, Suspense, useLayoutEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BuilderRouterProvider } from './shell/router.tsx';
import type { PreviewRolePolicyInput } from './wayfinding/walkthrough/permissions/route-navigation-policy.ts';

// Owner explicitly confirmed this venue has no staff-only zones or doors.
// This is a complete local preview assertion, not authenticated staff authorization.
// Revise this assertion if the venue's access restrictions change.
const floorPlanStudioPolicy: PreviewRolePolicyInput = {
  status: 'resolved',
  source: 'venue-owner-confirmation:floor-plan-studio:no-staff-only-zones-or-doors',
  revision: 'owner-confirmation-2026-11-03-v1',
  buildingId: 'floor-plan-studio',
  complete: true,
  staffOnlyZoneIds: [],
  staffOnlyDoorObjectIds: [],
};

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
const FurniturePreview = import.meta.env.DEV
  ? lazy(() => import('./components/FurniturePreview.tsx'))
  : null;
const WayfindingPreview = import.meta.env.DEV
  ? lazy(() => import('./wayfinding/ui/WayfindingPreview.tsx'))
  : null;
const WashRackPreview = import.meta.env.DEV
  ? lazy(() => import('./components/WashRackPreview.tsx'))
  : null;
const ShippingPreview = import.meta.env.DEV
  ? lazy(() => import('./components/ShippingPreview.tsx'))
  : null;
const ParkingLotPreview = import.meta.env.DEV
  ? lazy(() => import('./components/ParkingLotPreview.tsx'))
  : null;
const DiningPreview = import.meta.env.DEV
  ? lazy(() => import('./components/DiningPreview.tsx'))
  : null;
const MotionLab = import.meta.env.DEV
  ? lazy(() => import('./components/dev/MotionLab.tsx'))
  : null;
const DevVenuePreview = import.meta.env.DEV ? lazy(() => import('./components/dev/DevVenuePreview.tsx')) : null;
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
    <BuilderRouterProvider>
      <TooltipProvider delayDuration={200}>
        <Suspense
          fallback={
            <p className="p-6" role="status">
              Opening floor plan studio…
            </p>
          }
        >
          {DevVenuePreview && location.pathname.endsWith('/preview') && new URLSearchParams(location.search).has('devFixture') ? <DevVenuePreview /> : MotionLab && new URLSearchParams(location.search).has('motionLab') ? (
            <MotionLab />
          ) : ParkingLotPreview && new URLSearchParams(location.search).has('parkingPreview') ? (
            <ParkingLotPreview />
          ) : DiningPreview && new URLSearchParams(location.search).has('diningPreview') ? (
            <DiningPreview />
          ) : ShippingPreview && new URLSearchParams(location.search).has('shippingPreview') ? (
            <ShippingPreview />
          ) : WashRackPreview && new URLSearchParams(location.search).has('washRackPreview') ? (
            <WashRackPreview />
          ) : CirculationPreview &&
            new URLSearchParams(location.search).has('circulationPreview') ? (
            <CirculationPreview />
          ) : StructurePreview && new URLSearchParams(location.search).has('structurePreview') ? (
            <StructurePreview />
          ) : AmenityPreview && new URLSearchParams(location.search).has('amenityPreview') ? (
            <AmenityPreview />
          ) : ServicePreview && new URLSearchParams(location.search).has('servicePreview') ? (
            <ServicePreview />
          ) : FurniturePreview && new URLSearchParams(location.search).has('furniturePreview') ? (
            <FurniturePreview />
          ) : WayfindingPreview && new URLSearchParams(location.search).has('wayfindingPreview') ? (
            <WayfindingPreview />
          ) : BoothPreview && new URLSearchParams(location.search).has('boothPreview') ? (
            <BoothPreview />
          ) : (
            <StudioPage
              runtimePolicy={
                new URLSearchParams(location.search).get('eventId')?.trim() === 'floor-plan-studio'
                  ? floorPlanStudioPolicy
                  : undefined
              }
            />
          )}
        </Suspense>
      </TooltipProvider>
    </BuilderRouterProvider>
  );
}
