import { useEffect } from 'react';
import {
  BoxesIcon,
  LayersIcon,
  MapPinIcon,
  PencilRulerIcon,
  ScanEyeIcon,
  SearchXIcon,
  StoreIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useActiveLayout } from '../../entities/building/model/active-layout.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import type { AppMode } from '../../widgets/app-shell/AppSidebar.tsx';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (mode: AppMode) => void;
}

export function CommandPalette({ open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const proof = useWorldStore((s) => s.assetProof);
  const layout = useActiveLayout();
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const selectBooth = useWorldStore((s) => s.selectBooth);
  const dollhouse = useWorldStore((s) => s.dollhouse);
  const toggleDollhouse = useWorldStore((s) => s.toggleDollhouse);
  const toggleProof = useWorldStore((s) => s.toggleAssetProof);
  const lowQuality = useWorldStore((s) => s.lowQuality);
  const toggleQuality = useWorldStore((s) => s.toggleQuality);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const { floors, rooms } = layout;

  const goToBooth = (roomId: string, floorId: string) => {
    onNavigate('world');
    setCurrentFloor(floorId);
    selectBooth(roomId);
    onOpenChange(false);
    void useWorldStore
      .getState()
      .startAutopilot(roomId)
      .then((started) => {
        if (!started) {
          toast.error(`No walkable route to ${roomId}.`);
        }
      });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search booths and commands"
      description="Teleport to a booth or toggle a view option."
    >
      <Command>
        <CommandInput
          aria-label="Search booths, floors, commands"
          placeholder="Search booths, floors, commands…"
        />
        <CommandList>
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <SearchXIcon className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No booths or commands match your search.</p>
              <p className="text-xs text-muted-foreground">
                Try a booth ID, floor name, or “dollhouse”. Press ↑↓ to navigate, ↵ to teleport,
                esc to close.
              </p>
            </div>
          </CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem
              value="go-3d-world"
              onSelect={() => {
                onNavigate('world');
                onOpenChange(false);
              }}
            >
              <BoxesIcon />
              3D World
            </CommandItem>
            <CommandItem
              value="go-admin-builder"
              onSelect={() => {
                onNavigate('admin');
                onOpenChange(false);
              }}
            >
              <PencilRulerIcon />
              Admin builder
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Floors">
            {floors.map((floor) => (
              <CommandItem
                key={floor.id}
                value={`floor-${floor.id} ${floor.name}`}
                onSelect={() => {
                  onNavigate('world');
                  setCurrentFloor(floor.id);
                  onOpenChange(false);
                }}
              >
                <LayersIcon className="text-muted-foreground" />
                {floor.name}
                <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                  {floor.id}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Booths">
            {rooms.map((room) => (
              <CommandItem
                key={room.id}
                value={`booth-${room.id} ${room.label ?? ''} ${room.floorId} ${room.type}`}
                onSelect={() => {
                  goToBooth(room.id, room.floorId);
                }}
              >
                {room.type === 'booth' ? (
                  <StoreIcon className="text-muted-foreground" />
                ) : (
                  <MapPinIcon className="text-muted-foreground" />
                )}
                <span className="truncate">{room.label ?? room.id}</span>
                <span className="ml-auto flex items-center gap-1">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {room.type}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {room.floorId}
                  </Badge>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="View">
            <CommandItem
              value="toggle-dollhouse"
              onSelect={() => {
                toggleDollhouse();
                onOpenChange(false);
              }}
            >
              <BoxesIcon />
              Dollhouse view
              <CommandShortcut>{dollhouse ? 'On' : 'Off'}</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="toggle-asset-preview"
              onSelect={() => {
                toggleProof();
                onOpenChange(false);
              }}
            >
              <ScanEyeIcon />
              Asset preview
              <CommandShortcut>{proof ? 'On' : 'Off'}</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="toggle-quality"
              onSelect={() => {
                toggleQuality();
                onOpenChange(false);
              }}
            >
              <ScanEyeIcon />
              Low quality rendering
              <CommandShortcut>{lowQuality ? 'On' : 'Off'}</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <div className="flex items-center gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-medium">↑↓ navigate</span>
          <span aria-hidden>·</span>
          <span className="font-medium">↵ teleport</span>
          <span aria-hidden>·</span>
          <span className="font-medium">esc close</span>
          <span className="ml-auto font-mono">
            {rooms.length} booths · {floors.length} floors
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
