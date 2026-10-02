import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Room } from '../../entities/building/model/building-schema.ts';
import { useLayoutStore } from '../../entities/building/model/layout-store.ts';
import { FloorPlanEditor } from '../../features/admin-annotate/FloorPlanEditor.tsx';
import { LayoutJsonPanel } from '../../features/admin-annotate/LayoutJsonPanel.tsx';
import { RoomsTable } from '../../features/admin-annotate/RoomsTable.tsx';

interface AdminBuilderPageProps {
  onLocate: (room: Room) => void;
}

export function AdminBuilderPage({ onLocate }: AdminBuilderPageProps) {
  const roomCount = useLayoutStore((s) => s.layout.rooms.length);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <Tabs defaultValue="annotate" className="mx-auto flex max-w-4xl flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="annotate">Annotate</TabsTrigger>
          <TabsTrigger value="rooms">
            Rooms
            <Badge variant="secondary" className="ml-1">
              {roomCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="json">Layout JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="annotate">
          <FloorPlanEditor />
        </TabsContent>
        <TabsContent value="rooms">
          <RoomsTable onLocate={onLocate} />
        </TabsContent>
        <TabsContent value="json">
          <LayoutJsonPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
