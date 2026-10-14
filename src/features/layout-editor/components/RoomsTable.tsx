import { useState, useEffect, useRef } from 'react';
import { LocateFixedIcon, SearchXIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type Room, type RoomType } from '@/features/building/model/building-schema.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { signedArea } from '@/utils/geometry/polygon.ts';

const ALL_FLOORS = 'all';

function typeVariant(type: RoomType): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (type) {
    case 'booth':
      return 'default';
    case 'hall':
      return 'secondary';
    case 'walkable':
      return 'outline';
    case 'service':
      return 'destructive';
  }
}

interface RoomsTableProps {
  onLocate: (room: Room) => void;
}

export function RoomsTable({ onLocate }: RoomsTableProps) {
  const floors = useLayoutStore((s) => s.layout.floors);
  const rooms = useLayoutStore((s) => s.layout.rooms);
  const [floorFilter, setFloorFilter] = useState<string>(ALL_FLOORS);
  const [scrollTop, setScrollTop] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setScrollTop(0);
    scroller.current?.scrollTo({ top: 0 });
  }, [floorFilter]);
  const visible =
    floorFilter === ALL_FLOORS ? rooms : rooms.filter((r) => r.floorId === floorFilter);

  const start = Math.max(0, Math.floor(scrollTop / 48) - 4);
  const end = Math.min(visible.length, start + 18);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rooms</CardTitle>
        <CardDescription>Every booth, hall and service area in the venue layout.</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Badge variant="secondary">{visible.length} rooms</Badge>
          <Select value={floorFilter} onValueChange={setFloorFilter}>
            <SelectTrigger className="w-32" aria-label="Filter by floor">
              <SelectValue placeholder="Floor" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Floor</SelectLabel>
                <SelectItem value={ALL_FLOORS}>All floors</SelectItem>
                {floors.map((floor) => (
                  <SelectItem key={floor.id} value={floor.id}>
                    {floor.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon />
              </EmptyMedia>
              <EmptyTitle>No rooms on this floor</EmptyTitle>
              <EmptyDescription>No rooms are assigned to the selected floor.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFloorFilter(ALL_FLOORS);
                }}
              >
                Show all floors
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div
            ref={scroller}
            className="h-96 overflow-auto rounded-lg border"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Area</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {start > 0 && (
                  <TableRow aria-hidden="true">
                    <TableCell colSpan={6} style={{ height: start * 48, padding: 0 }} />
                  </TableRow>
                )}
                {visible.slice(start, end).map((room, index) => (
                  <TableRow key={room.id} className={index % 2 === 1 ? 'h-12 bg-muted/30' : 'h-12'}>
                    <TableCell className="font-medium">{room.label ?? room.id}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{room.floorId}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeVariant(room.type)}>{room.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {Math.abs(signedArea(room.polygon)).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">
                      {room.price !== undefined ? `$${room.price.toFixed(0)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onLocate(room);
                        }}
                      >
                        <LocateFixedIcon data-icon="inline-start" />
                        Locate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {end < visible.length && (
                  <TableRow aria-hidden="true">
                    <TableCell
                      colSpan={6}
                      style={{ height: (visible.length - end) * 48, padding: 0 }}
                    />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
