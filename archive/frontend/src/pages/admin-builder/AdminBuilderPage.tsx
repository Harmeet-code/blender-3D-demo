import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Room } from '@/features/building/model/building-schema.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { FloorPlanEditor } from '@/features/layout-editor/components/FloorPlanEditor.tsx';
import { LayoutJsonPanel } from '@/features/layout-editor/components/LayoutJsonPanel.tsx';
import { RoomsTable } from '@/features/layout-editor/components/RoomsTable.tsx';
import { Button } from '@/components/ui/button';
import { useSaveLayout } from '@/features/building/hooks/use-save-layout.ts';
import { configuredEventId } from '@/app/config/constants.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getLayoutDraft } from '@/features/building/api/layouts-client.ts';
import { publishReadiness } from '@/features/building/model/layout-readiness.ts';

interface AdminBuilderPageProps {
  onLocate: (room: Room) => void;
}

export function AdminBuilderPage({ onLocate }: AdminBuilderPageProps) {
  const roomCount = useLayoutStore((s) => s.layout.rooms.length);
  const source = useLayoutStore((s) => s.source);
  const save = useSaveLayout(configuredEventId());
  const draftSave = useSaveLayout(configuredEventId(), 'draft');
  const issues = useMemo(() => publishReadiness(source), [source]);
  const [draftMessage, setDraftMessage] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(false);
  const draftLoadGeneration = useRef(0);
  useEffect(
    () => () => {
      draftLoadGeneration.current++;
    },
    [],
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Venue studio</h1>
          <p className="text-sm text-muted-foreground">
            Save a working draft; Save venue publishes to visitors.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={draftSave.isPending}
            onClick={() => draftSave.mutate(source)}
          >
            {draftSave.isPending ? 'Saving draft…' : 'Save draft'}
          </Button>
          <Button
            variant="outline"
            disabled={loadingDraft || draftSave.isPending}
            onClick={async () => {
              const generation = ++draftLoadGeneration.current;
              const requestedSource = useLayoutStore.getState().source;
              setLoadingDraft(true);
              setDraftMessage('');
              try {
                const response = await getLayoutDraft(configuredEventId());
                if (generation !== draftLoadGeneration.current) {
                  return;
                }
                if (useLayoutStore.getState().source !== requestedSource) {
                  setDraftMessage(
                    'The venue changed while loading. Load the draft again to replace it.',
                  );
                } else if (response.isErr()) {
                  setDraftMessage(response.error.message);
                } else if (!response.value) {
                  setDraftMessage('No server draft has been saved for this venue.');
                } else {
                  const result = useLayoutStore.getState().commit(response.value);
                  setDraftMessage(
                    result.isOk()
                      ? 'Server draft loaded. Undo restores the previous layout.'
                      : result.error.message,
                  );
                }
              } catch (error) {
                if (generation === draftLoadGeneration.current) {
                  setDraftMessage(
                    error instanceof Error ? error.message : 'Could not load the draft.',
                  );
                }
              } finally {
                if (generation === draftLoadGeneration.current) {
                  setLoadingDraft(false);
                }
              }
            }}
          >
            {loadingDraft ? 'Loading draft…' : 'Load saved draft'}
          </Button>
          <Button
            disabled={save.isPending || issues.length > 0}
            onClick={() => save.mutate(source)}
          >
            {save.isPending ? 'Saving…' : 'Save venue'}
          </Button>
        </div>
      </div>
      {(draftMessage || draftSave.isSuccess || draftSave.isError) && (
        <p className="mx-auto mb-3 max-w-4xl text-sm" role="status">
          {draftMessage ||
            (draftSave.isError
              ? draftSave.error.message
              : draftSave.variables !== source
                ? 'Earlier draft saved. Save again to retain the current edits.'
                : 'Draft saved. The published visitor layout is unchanged.')}
        </p>
      )}
      {issues.length > 0 && (
        <div
          className="mx-auto mb-4 max-w-4xl rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
          role="status"
        >
          <p className="font-medium">Before publishing</p>
          <ul className="mt-1 list-disc pl-5">
            {issues.slice(0, 6).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          {issues.length > 6 && (
            <p className="mt-1">And {issues.length - 6} more placement issues.</p>
          )}
          <p className="mt-2 text-muted-foreground">
            You can keep editing and save a private draft.
          </p>
        </div>
      )}
      {(save.isSuccess || save.isError) && (
        <p className="mx-auto mb-3 max-w-4xl text-sm" role="status">
          {save.isError
            ? save.error.message
            : 'Venue saved. Images, booths, placements, and routes will reload with this event.'}
        </p>
      )}
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
