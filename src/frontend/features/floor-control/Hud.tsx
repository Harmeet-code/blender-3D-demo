import { useLayoutStore } from '../../entities/building/model/layout-store.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

export function Hud() {
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const dollhouse = useWorldStore((s) => s.dollhouse);
  const toggleDollhouse = useWorldStore((s) => s.toggleDollhouse);
  const floors = useLayoutStore((s) => s.layout.floors);
  const proof = useWorldStore((s) => s.assetProof);
  const toggleProof = useWorldStore((s) => s.toggleAssetProof);
  const lowQuality = useWorldStore((s) => s.lowQuality);
  const toggleQuality = useWorldStore((s) => s.toggleQuality);

  return (
    <div className="absolute top-3 left-3 flex items-center gap-2">
      {floors.map((floor) => (
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
      <button
        type="button"
        onClick={toggleProof}
        className="rounded-full bg-white/10 px-3 py-1 text-xs"
      >
        {proof ? 'Venue view' : 'Asset preview'}
      </button>
      <button
        type="button"
        onClick={toggleQuality}
        className="rounded-full bg-white/10 px-3 py-1 text-xs"
      >
        {lowQuality ? 'Quality: low' : 'Quality: normal'}
      </button>
    </div>
  );
}
