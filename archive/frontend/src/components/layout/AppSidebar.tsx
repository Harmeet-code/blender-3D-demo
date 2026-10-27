import {
  BoxesIcon,
  Building2Icon,
  LayersIcon,
  PencilRulerIcon,
  SearchIcon,
  BriefcaseBusinessIcon,
} from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { PresenceAvatars } from '@/features/presence/components/PresenceAvatars.tsx';
import type { AppRoute } from '@/app/config/routes.ts';

interface AppSidebarProps {
  mode: AppRoute;
  onNavigate: (mode: AppRoute) => void;
  onOpenPalette: () => void;
}

export function AppSidebar({ mode, onNavigate: navigate, onOpenPalette }: AppSidebarProps) {
  const { setOpenMobile } = useSidebar();
  const onNavigate = (route: AppRoute) => {
    navigate(route);
    setOpenMobile(false);
  };
  const activeLayout = useActiveLayout(),
    savedLayout = useLayoutStore((s) => s.layout);
  const { floors, rooms } = mode === 'admin' ? savedLayout : activeLayout;
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const setCurrentFloor = useWorldStore((s) => s.setCurrentFloor);
  const cartCount = useWorldStore((s) =>
    Object.values(s.cart).reduce((n, ids) => n + ids.length, 0),
  );

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              isActive={mode === 'world'}
              onClick={() => {
                onNavigate('world');
              }}
              tooltip="Spatial Venue 3D"
            >
              <BoxesIcon />
              <span className="font-heading font-medium">Spatial Venue 3D</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mode === 'world'}
                  onClick={() => {
                    onNavigate('world');
                  }}
                  tooltip="3D World"
                >
                  <BoxesIcon />
                  <span>3D World</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mode === 'admin'}
                  onClick={() => {
                    onNavigate('admin');
                  }}
                  tooltip="Admin builder"
                >
                  <PencilRulerIcon />
                  <span>Admin builder</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mode === 'mall'}
                  onClick={() => onNavigate('mall')}
                  tooltip="Luminary Galleria"
                >
                  <Building2Icon />
                  <span>Luminary Galleria</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mode === 'inventory'}
                  onClick={() => onNavigate('inventory')}
                  tooltip="Asset inventory"
                >
                  <BoxesIcon />
                  <span>Asset inventory</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onOpenPalette} tooltip="Search and commands">
                  <SearchIcon />
                  <span>Search…</span>
                  <Kbd className="ml-auto">⌘K</Kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mode === 'venue'}
                  onClick={() => onNavigate('venue')}
                  tooltip="Venue management"
                >
                  <BriefcaseBusinessIcon />
                  <span>Venue management</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {(mode === 'world' || mode === 'admin') && (
          <SidebarGroup>
            <SidebarGroupLabel>Floors</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {floors.map((floor) => (
                  <SidebarMenuItem key={floor.id}>
                    <SidebarMenuButton
                      isActive={floor.id === currentFloorId}
                      onClick={() => {
                        setCurrentFloor(floor.id);
                        onNavigate('world');
                      }}
                      tooltip={floor.name}
                    >
                      <LayersIcon />
                      <span>{floor.name}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="text-muted-foreground/70 tabular-nums">
                      {rooms.filter((room) => room.floorId === floor.id).length}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 p-2">
              <PresenceAvatars />
              <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                {cartCount > 0
                  ? `${cartCount} add-on${cartCount === 1 ? '' : 's'} selected`
                  : 'You are here'}
              </span>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
