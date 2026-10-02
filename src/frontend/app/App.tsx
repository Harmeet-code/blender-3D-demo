import { useState } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { type Room } from '../entities/building/model/building-schema.ts';
import { useWorldStore } from '../entities/viewer/model/viewer-store.ts';
import { CommandPalette } from '../features/command-palette/CommandPalette.tsx';
import { AdminBuilderPage } from '../pages/admin-builder-page/AdminBuilderPage.tsx';
import { WorldPage } from '../pages/world-page/WorldPage.tsx';
import { AppHeader } from '../widgets/app-shell/AppHeader.tsx';
import { AppSidebar, type AppMode } from '../widgets/app-shell/AppSidebar.tsx';

export function App() {
  const [mode, setMode] = useState<AppMode>('world');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const selectBooth = useWorldStore((s) => s.selectBooth);

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
          {mode === 'world' ? <WorldPage /> : <AdminBuilderPage onLocate={locateRoom} />}
        </div>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={setMode} />
    </SidebarProvider>
  );
}
