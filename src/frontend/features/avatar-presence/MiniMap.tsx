import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

/** Top-down radar synced to avatar position. */
export function MiniMap() {
  const localAvatar = useWorldStore((s) => s.localAvatar);
  const [x, , z] = localAvatar.position;
  return (
    <Card className="absolute right-3 bottom-3 w-32 gap-2 rounded-xl border bg-background/80 py-3 shadow-lg ring-1 ring-white/10 backdrop-blur-md sm:w-36">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-xs">Mini-map</CardTitle>
          <CardDescription className="text-[10px]">Top-down radar</CardDescription>
        </div>
        <Badge variant="secondary">{localAvatar.floorId}</Badge>
      </CardHeader>
      <CardContent>
        <div className="relative h-20 w-full overflow-hidden rounded-lg border bg-muted/60 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:12px_12px]">
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-muted-foreground">
            N
          </span>
          <div
            className="absolute size-2 rounded-full bg-primary ring-2 ring-primary/30 after:absolute after:inset-[-6px] after:animate-ping after:rounded-full after:bg-primary/20"
            style={{ left: `${50 + x * 4}%`, top: `${50 + z * 4}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
