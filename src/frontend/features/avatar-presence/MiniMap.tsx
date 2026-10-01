import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

/** Top-down radar stub synced to avatar position. */
export function MiniMap() {
  const localAvatar = useWorldStore((s) => s.localAvatar);
  const [x, , z] = localAvatar.position;
  return (
    <div className="absolute right-3 bottom-3 h-32 w-32 rounded-xl border border-white/15 bg-black/60 p-2 text-[10px]">
      <div>Mini-map — {localAvatar.floorId}</div>
      <div className="relative mt-1 h-20 w-full rounded bg-white/5">
        <div
          className="absolute h-2 w-2 rounded-full bg-sky-400"
          style={{ left: `${50 + x * 4}%`, top: `${50 + z * 4}%` }}
        />
      </div>
    </div>
  );
}
