import { Stage, Layer, Rect, Line as KonvaLine } from 'react-konva';
import { demoLayout } from '../../entities/building/model/building-schema.ts';

/** Phase 1 stub: upload floor image, draw booth polygons, export layout JSON. */
export function FloorPlanEditor() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="text-sm font-semibold tracking-wide">Floor-plan editor (Konva stub)</h2>
      <p className="mt-1 text-xs text-white/60">
        Upload JPG/PNG, draw booth polygons + portal markers, export layout JSON.
      </p>
      <Stage width={480} height={320} className="mt-3 overflow-hidden rounded-lg bg-black/40">
        <Layer>
          <Rect x={20} y={20} width={440} height={280} fill="#111827" cornerRadius={8} />
          {demoLayout.rooms.map((room) => (
            <KonvaLine
              key={room.id}
              points={room.polygon.flat()}
              closed
              stroke="#38bdf8"
              strokeWidth={2}
              fill="rgba(56,189,248,0.15)"
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
