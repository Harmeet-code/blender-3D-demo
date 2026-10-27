import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { type Room } from '@/features/building/model/building-schema.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { useLayoutQuery } from '@/features/building/hooks/use-layout-query.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import {
  useConfiguredEventId,
  useAcceptedEventId,
  acknowledgeEventLayout,
} from '@/app/config/constants.ts';
import { routeFromHash, type AppRoute } from '@/app/config/routes.ts';
import { CommandPalette } from '@/features/navigation/components/CommandPalette.tsx';
import {
  preferredFloorId,
  preferredWalkMode,
} from '@/features/navigation/model/wayfinding-preferences.ts';
import { AppHeader } from '@/components/layout/AppHeader.tsx';
import { AppSidebar } from '@/components/layout/AppSidebar.tsx';
import { navigationClient } from '@/features/building/model/navigation-client.ts';
import { acceptLayoutVersion } from '@/features/building/api/layouts-client.ts';
import {
  ExperienceTools,
  presentationFromUrl,
} from '@/features/experience/components/ExperienceTools.tsx';

const MallPage = lazy(() => import('@/pages/mall/MallPage.tsx'));
const VenuePage = lazy(() =>
  import('@/pages/venue/VenuePage.tsx').then((module) => ({ default: module.VenuePage })),
);
const InventoryPage = lazy(() =>
  import('@/pages/inventory/InventoryPage.tsx').then((module) => ({
    default: module.InventoryPage,
  })),
);
const WorldPage = lazy(() =>
  import('@/pages/world/WorldPage.tsx').then((module) => ({ default: module.WorldPage })),
);
const AdminBuilderPage = lazy(() =>
  import('@/pages/admin-builder/AdminBuilderPage.tsx').then((module) => ({
    default: module.AdminBuilderPage,
  })),
);

export function App() {
  const [mode, setMode] = useState<AppRoute>(() => routeFromHash(window.location.hash));
  useEffect(() => {
    if (mode !== 'world') {
      useWorldStore.getState().setWalkMode(false);
      useWorldStore.getState().cancelAutopilot();
      navigationClient.dispose();
    }
  }, [mode]);
  const navigate = (route: AppRoute) => {
    window.location.hash = `/${route}`;
    setMode(route);
  };
  useEffect(() => {
    const followHistory = () => setMode(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', followHistory);
    return () => window.removeEventListener('hashchange', followHistory);
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layoutUpdateError, setLayoutUpdateError] = useState<string | null>(null);
  const loadedEvent = useAcceptedEventId();
  const presentation = presentationFromUrl();
  const updateLayout = useLayoutStore((s) => s.update);
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const selectBooth = useWorldStore((s) => s.selectBooth);
  const eventId = useConfiguredEventId();
  const previousEvent = useRef(eventId);
  const lastAppliedLayout = useRef<unknown>(null);
  const layoutQuery = useLayoutQuery(eventId);
  useEffect(() => {
    if (previousEvent.current === eventId) {
      return;
    }
    previousEvent.current = eventId;
    lastAppliedLayout.current = null;
    delete document.documentElement.dataset.loadedEvent;
    setLayoutUpdateError(null);
    const state = useWorldStore.getState();
    state.setWalkMode(false);
    state.cancelAutopilot();
    state.selectBooth(null);
    state.clearRemoteAvatars();
    useWorldStore.setState({ cart: {}, logos: {}, assetProof: false, stressPreview: false });
  }, [eventId]);
  useEffect(() => {
    if (!layoutQuery.data) {
      return;
    }
    if (loadedEvent === eventId && lastAppliedLayout.current === layoutQuery.data) {
      return;
    }
    // A late query response must not replace accepted edits made while it was in flight.
    if (useLayoutStore.getState().dirty) {
      return;
    }
    const result = updateLayout(layoutQuery.data);
    setLayoutUpdateError(result.isErr() ? result.error.message : null);
    if (result.isOk()) {
      acceptLayoutVersion(eventId, layoutQuery.data);
      lastAppliedLayout.current = layoutQuery.data;
      acknowledgeEventLayout(eventId);
      const state = useWorldStore.getState();
      const { floors } = useLayoutStore.getState().layout;
      const stored = preferredFloorId(useLayoutStore.getState().layout);
      const active =
        floors.find((floor) => floor.id === (stored ?? state.currentFloorId)) ?? floors[0];
      if (active) {
        setCurrentFloor(active.id);
        if (preferredWalkMode(useLayoutStore.getState().layout)) {
          state.setWalkMode(true);
        }
      }
    }
  }, [layoutQuery.data, updateLayout, setCurrentFloor, eventId, loadedEvent]);

  const openPalette = () => {
    setPaletteOpen(true);
  };

  const locateRoom = (room: Room) => {
    navigate('world');
    setCurrentFloor(room.floorId);
    selectBooth(room.id);
  };

  if (presentation !== 'normal') {
    return (
      <main className="relative flex h-svh min-h-0 flex-col overflow-hidden">
        {loadedEvent === eventId ? (
          <Suspense fallback={<p className="p-6">Opening venue…</p>}>
            <WorldPage />
          </Suspense>
        ) : (
          <p className="p-6" role="status">
            {layoutQuery.isError
              ? 'Could not load this venue. Check the connection and event link.'
              : 'Loading venue…'}
          </p>
        )}
        {loadedEvent === eventId && <ExperienceTools presentation={presentation} />}
      </main>
    );
  }

  return (
    <SidebarProvider defaultOpen className="h-svh min-h-0 overflow-hidden">
      <AppSidebar mode={mode} onNavigate={navigate} onOpenPalette={openPalette} />
      <SidebarInset className="h-full min-h-0 overflow-hidden">
        <AppHeader mode={mode} onNavigate={navigate} onOpenPalette={openPalette} />
        <div className="relative flex min-h-0 flex-1 flex-col">
          {(mode === 'world' || mode === 'admin') && layoutQuery.isPending && (
            <Alert className="mx-4 mt-4 w-auto">
              <AlertTitle>Loading event layout</AlertTitle>
              <AlertDescription>
                The venue opens after its current layout is accepted.
              </AlertDescription>
            </Alert>
          )}
          {(mode === 'world' || mode === 'admin') &&
            loadedEvent !== eventId &&
            (layoutQuery.isError || layoutUpdateError) && (
              <Alert variant="destructive" className="mx-4 mt-4 w-auto">
                <AlertTitle>Could not load event layout</AlertTitle>
                <AlertDescription>
                  {layoutUpdateError ??
                    layoutQuery.error?.message ??
                    'The layout could not be loaded.'}
                </AlertDescription>
              </Alert>
            )}
          {(mode === 'world' || mode === 'admin') &&
            loadedEvent === eventId &&
            layoutQuery.isError && (
              <p className="border-b bg-muted px-4 py-2 text-xs" role="status">
                Viewing an authenticated draft. Visitors will see it after publication.
              </p>
            )}
          {mode === 'venue' ? (
            <Suspense
              fallback={
                <p className="p-6" role="status">
                  Opening venue management…
                </p>
              }
            >
              <VenuePage />
            </Suspense>
          ) : (mode === 'world' || mode === 'admin') && loadedEvent !== eventId ? (
            <p className="p-6" role="status">
              {layoutQuery.isError
                ? 'The venue could not load. Retry from venue management or check the server.'
                : 'Loading venue…'}
            </p>
          ) : mode === 'mall' ? (
            <Suspense
              fallback={
                <p className="p-6" role="status">
                  Opening Luminary Galleria…
                </p>
              }
            >
              <MallPage />
            </Suspense>
          ) : mode === 'inventory' ? (
            <Suspense
              fallback={
                <p className="p-6" role="status">
                  Opening inventory…
                </p>
              }
            >
              <InventoryPage />
            </Suspense>
          ) : mode === 'world' ? (
            <Suspense
              fallback={
                <p className="p-6" role="status">
                  Opening venue…
                </p>
              }
            >
              <WorldPage />
            </Suspense>
          ) : (
            <Suspense
              fallback={
                <p className="p-6" role="status">
                  Opening editor…
                </p>
              }
            >
              <AdminBuilderPage onLocate={locateRoom} />
            </Suspense>
          )}
          {mode === 'world' && loadedEvent === eventId && (
            <ExperienceTools presentation={presentation} />
          )}
        </div>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={navigate} />
    </SidebarProvider>
  );
}
