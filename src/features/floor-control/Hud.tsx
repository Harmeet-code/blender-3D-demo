import { demoLayout } from '../../entities/building/model/building-schema.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

export function Hud() {
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const dollhouse = useWorldStore((s) => s.dollhouse);
  const toggleDollhouse = useWorldStore((s) => s.toggleDollhouse);

  return (
    <div className="absolute top-3 left-3 flex items-center gap-2">
      {demoLayout.floors.map((floor) => (
        <button
          key={floor.id}
          type="button"
          onClick={() => {
            setCurrentFloor(floor.id);
          }}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            floor.id === currentFloorId ? 'bg-sky-400 text-black' : 'bg-white/10 text-white'
          }`}
        >
          {floor.name}
        </button>
      ))}
      <button
        type="button"
        onClick={toggleDollhouse}
        className="rounded-full bg-white/10 px-3 py-1 text-xs"
      >
        {dollhouse ? 'Stacked' : 'Dollhouse'}
      </button>
    </div>
  );
}
