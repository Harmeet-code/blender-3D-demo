import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

/** Top-down radar synced to avatar position. */
export function MiniMap() {
  const localAvatar = useWorldStore((s) => s.localAvatar);
  const [x, , z] = localAvatar.position;
  return (
    <Card className="absolute right-3 bottom-3 w-32 gap-2 bg-popover/90 py-3 backdrop-blur sm:w-36">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-xs">Mini-map</CardTitle>
          <CardDescription className="text-[10px]">Top-down radar</CardDescription>
        </div>
        <Badge variant="secondary">{localAvatar.floorId}</Badge>
      </CardHeader>
      <CardContent>
        <div className="relative h-20 w-full overflow-hidden rounded-lg bg-muted">
          <div
            className="absolute size-2 rounded-full bg-primary"
            style={{ left: `${50 + x * 4}%`, top: `${50 + z * 4}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
