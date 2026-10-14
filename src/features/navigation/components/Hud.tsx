import { LayersIcon, FootprintsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { ViewOptions } from '@/features/navigation/components/ViewOptions.tsx';

export function Hud() {
  const walkMode = useWorldStore((s) => s.walkMode);
  const setWalkMode = useWorldStore((s) => s.setWalkMode);
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const { floors } = useActiveLayout();

  return (
    <div className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1 overflow-x-auto rounded-xl border bg-background/80 p-1.5 text-popover-foreground shadow-lg ring-1 ring-white/10 backdrop-blur-md sm:gap-2">
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
      <Button
        type="button"
        size="sm"
        variant={walkMode ? 'default' : 'ghost'}
        aria-pressed={walkMode}
        onClick={() => setWalkMode(!walkMode)}
        title="Click the scene; WASD or arrow keys to walk, Shift to run"
      >
        <FootprintsIcon /> <span className="hidden sm:inline">{walkMode ? 'Walking' : 'Walk'}</span>
      </Button>
    </div>
  );
}
