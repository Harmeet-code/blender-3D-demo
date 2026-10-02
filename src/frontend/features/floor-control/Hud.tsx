import { LayersIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useActiveLayout } from '../../entities/building/model/active-layout.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import { ViewOptions } from './ViewOptions.tsx';

export function Hud() {
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const { floors } = useActiveLayout();

  return (
    <div className="absolute top-3 left-3 flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-xl border bg-popover/90 p-1.5 text-popover-foreground shadow-lg backdrop-blur sm:gap-2">
      <Select value={currentFloorId} onValueChange={setCurrentFloor}>
        <SelectTrigger className="w-36 sm:hidden" aria-label="Active floor">
          <SelectValue placeholder="Choose a floor" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Floors</SelectLabel>
            {floors.map((floor) => (
              <SelectItem key={floor.id} value={floor.id}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        value={currentFloorId ?? ''}
        onValueChange={(value) => {
          if (value) {
            setCurrentFloor(value);
          }
        }}
        aria-label="Active floor"
        className="hidden sm:flex"
      >
        {floors.map((floor) => (
          <ToggleGroupItem key={floor.id} value={floor.id} aria-label={floor.name}>
            <LayersIcon data-icon="inline-start" />
            {floor.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="h-5!" />
      <ViewOptions />
    </div>
  );
}
