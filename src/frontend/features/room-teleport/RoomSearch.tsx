import { useState } from 'react';
import { useLayoutStore } from '../../entities/building/model/layout-store.ts';
import { assetProofLayout } from '../../entities/building/model/asset-proof-layout.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

export function RoomSearch() {
  const [query, setQuery] = useState('');
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const selectBooth = useWorldStore((s) => s.selectBooth);
  const proof = useWorldStore((s) => s.assetProof);
  const layout = useLayoutStore((s) => s.layout);
  const results = (proof ? assetProofLayout : layout).rooms.filter((room) =>
    room.id.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="absolute bottom-3 left-3 w-64 rounded-xl border border-white/10 bg-black/60 p-2">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        placeholder="Take me to Booth…"
        className="w-full rounded-md bg-white/10 px-2 py-1 text-xs outline-none"
      />
      {query && (
        <ul className="mt-1 max-h-32 overflow-auto text-xs">
          {results.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left hover:bg-white/10"
                onClick={() => {
                  setCurrentFloor(room.floorId);
                  selectBooth(room.id);
                  setQuery('');
                }}
              >
                {room.id} · {room.floorId}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
