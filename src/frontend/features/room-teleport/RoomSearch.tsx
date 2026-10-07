import { useState } from 'react';
import { FootprintsIcon, SearchIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useActiveLayout } from '../../entities/building/model/active-layout.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

export function RoomSearch() {
  const [query, setQuery] = useState('');
  const selectBooth = useWorldStore((s) => s.selectBooth);
  const autopilot = useWorldStore((s) => s.autopilot);
  const cancelAutopilot = useWorldStore((s) => s.cancelAutopilot);
  const layout = useActiveLayout();
  const results = layout.rooms.filter((room) =>
    room.id.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Card className="absolute bottom-3 left-3 w-[calc(100vw-11rem)] max-w-64 gap-2 rounded-xl border bg-background/80 py-3 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
      <CardContent className="flex flex-col gap-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Take me to Booth…"
            aria-label="Search booths"
            className="pl-8"
          />
        </div>
        {autopilot && (
          <Button type="button" variant="outline" size="sm" onClick={cancelAutopilot}>
            <XIcon data-icon="inline-start" />
            Stop walking to {autopilot.destinationId}
          </Button>
        )}
        {query && (
          <ScrollArea className="max-h-32">
            {results.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">No booths match “{query}”.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {results.map((room) => (
                  <li key={room.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => {
                        selectBooth(room.id);
                        void useWorldStore
                          .getState()
                          .startAutopilot(room.id)
                          .then((started) => {
                            if (!started) {
                              toast.error(`No walkable route to ${room.id}.`);
                              return;
                            }
                            setQuery('');
                          });
                      }}
                    >
                      <FootprintsIcon data-icon="inline-start" />
                      <span className="truncate">{room.id}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {room.floorId}
                      </Badge>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
