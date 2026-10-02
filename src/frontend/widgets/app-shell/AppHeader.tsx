import { useState } from 'react';
import { LogOutIcon, SearchIcon, SettingsIcon, UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useActiveLayout } from '../../entities/building/model/active-layout.ts';
import { useLayoutStore } from '../../entities/building/model/layout-store.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import type { AppMode } from './AppSidebar.tsx';
import { PreferencesDialog } from './PreferencesDialog.tsx';

interface AppHeaderProps {
  mode: AppMode;
  onNavigate: (mode: AppMode) => void;
  onOpenPalette: () => void;
}

export function AppHeader({ mode, onNavigate, onOpenPalette }: AppHeaderProps) {
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const activeLayout = useActiveLayout(),
    savedLayout = useLayoutStore((s) => s.layout);
  const layout = mode === 'admin' ? savedLayout : activeLayout;
  const floorName =
    layout.floors.find((floor) => floor.id === currentFloorId)?.name ?? currentFloorId;
  const roomCount = layout.rooms.length;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-5!" />
        <Breadcrumb className="hidden min-w-0 sm:block">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                asChild
                onClick={() => {
                  onNavigate('world');
                }}
              >
                <Button type="button" variant="link" size="sm" className="h-auto p-0">
                  Spatial Venue
                </Button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {mode === 'world' ? `3D World · ${floorName}` : 'Admin builder'}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="hidden md:inline-flex">
            {roomCount} booths
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="sm:w-auto sm:px-2.5"
            onClick={onOpenPalette}
            aria-label="Search booths and commands"
          >
            <SearchIcon data-icon="inline-start" />
            <span className="hidden text-muted-foreground sm:inline">Search booths…</span>
            <KbdGroup className="hidden sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Account">
                <Avatar className="size-6">
                  <AvatarFallback>YO</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Local visitor</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    toast.info('Profiles are stubbed in this demo.');
                  }}
                >
                  <UserIcon />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setPreferencesOpen(true);
                  }}
                >
                  <SettingsIcon />
                  Preferences
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => {
                    toast.info('Sign-out is stubbed in this demo.');
                  }}
                >
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
    </>
  );
}
