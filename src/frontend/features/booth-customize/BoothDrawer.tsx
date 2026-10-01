import { BOOTH_ADD_ONS } from '../../entities/building/model/building-schema.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

export function BoothDrawer() {
  const selectedBoothId = useWorldStore((s) => s.selectedBoothId);
  const cart = useWorldStore((s) => s.cart);
  const toggleAddOn = useWorldStore((s) => s.toggleAddOn);
  const selectBooth = useWorldStore((s) => s.selectBooth);

  if (!selectedBoothId) {
    return null;
  }
  const selected = cart[selectedBoothId] ?? [];

  return (
    <aside className="absolute top-0 right-0 flex h-full w-80 flex-col border-l border-white/10 bg-[#111827]/95 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{selectedBoothId}</h2>
        <button
          type="button"
          onClick={() => {
            selectBooth(null);
          }}
          className="rounded-md border border-white/15 px-2 py-1 text-xs"
        >
          Close
        </button>
      </div>
      <div className="mt-3 space-y-2 overflow-auto">
        {BOOTH_ADD_ONS.map((addOn) => (
          <label
            key={addOn.id}
            className="flex items-center gap-2 rounded-lg border border-white/10 p-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(addOn.id)}
              onChange={() => {
                toggleAddOn(selectedBoothId, addOn.id);
              }}
            />
            <span>{addOn.label}</span>
            <span className="ml-auto text-[10px] text-white/50 uppercase">{addOn.kind}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-black"
      >
        Reserve — {selected.length} add-on{selected.length === 1 ? '' : 's'}
      </button>
    </aside>
  );
}
