import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { type Room } from '../entities/building/model/building-schema.ts';
import { useLayoutStore } from '../entities/building/model/layout-store.ts';
import { useWorldStore } from '../entities/viewer/model/viewer-store.ts';
import { CommandPalette } from '../features/command-palette/CommandPalette.tsx';
import { AdminBuilderPage } from '../pages/admin-builder-page/AdminBuilderPage.tsx';
import { WorldPage } from '../pages/world-page/WorldPage.tsx';
import { AppHeader } from '../widgets/app-shell/AppHeader.tsx';
import { AppSidebar, type AppMode } from '../widgets/app-shell/AppSidebar.tsx';

export function App() {
  const [mode, setMode] = useState<AppMode>('world');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const loadLayout = useLayoutStore((s) => s.load);
  const loadStatus = useLayoutStore((s) => s.loadStatus);
  const loadError = useLayoutStore((s) => s.loadError);
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const selectBooth = useWorldStore((s) => s.selectBooth);
  const eventId = import.meta.env['VITE_EVENT_ID'] ?? 'convention-center-01';

  useEffect(() => {
    void loadLayout(eventId);
  }, [eventId, loadLayout]);

  const openPalette = () => {
    setPaletteOpen(true);
  };

  const locateRoom = (room: Room) => {
    setMode('world');
    setCurrentFloor(room.floorId);
    selectBooth(room.id);
  };

  return (
    <SidebarProvider defaultOpen className="h-svh min-h-0 overflow-hidden">
      <AppSidebar mode={mode} onNavigate={setMode} onOpenPalette={openPalette} />
      <SidebarInset className="h-full min-h-0 overflow-hidden">
        <AppHeader mode={mode} onNavigate={setMode} onOpenPalette={openPalette} />
        <div className="flex min-h-0 flex-1 flex-col">
          {loadStatus === 'loading' && (
            <Alert className="mx-4 mt-4 w-auto">
              <AlertTitle>Loading event layout</AlertTitle>
              <AlertDescription>The demo layout remains available while the event loads.</AlertDescription>
            </Alert>
          )}
          {loadStatus === 'error' && (
            <Alert variant="destructive" className="mx-4 mt-4 w-auto">
              <AlertTitle>Could not load event layout</AlertTitle>
              <AlertDescription>
                {loadError ?? 'The demo or last valid layout is still available.'}
              </AlertDescription>
            </Alert>
          )}
          {mode === 'world' ? <WorldPage /> : <AdminBuilderPage onLocate={locateRoom} />}
        </div>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={setMode} />
    </SidebarProvider>
  );
}
