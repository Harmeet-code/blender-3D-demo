import { WorldCanvas } from '../../widgets/world-viewport/WorldCanvas.tsx';
import { Hud } from '../../features/floor-control/Hud.tsx';
import { BoothDrawer } from '../../features/booth-customize/BoothDrawer.tsx';
import { MiniMap } from '../../features/avatar-presence/MiniMap.tsx';
import { RoomSearch } from '../../features/room-teleport/RoomSearch.tsx';

export function WorldPage() {
  return (
    <main className="relative min-h-0 flex-1">
      <WorldCanvas />
      <Hud />
      <BoothDrawer />
      <MiniMap />
      <RoomSearch />
    </main>
  );
}
