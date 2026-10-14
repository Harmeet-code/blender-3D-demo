import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapQueryResult } from '@/api/query-result.ts';
import type { BuildingLayout } from '@/features/building/model/building-schema.ts';
import { saveLayout, saveLayoutDraft } from '@/features/building/api/layouts-client.ts';
import { layoutQueryKey } from './use-layout-query.ts';
import { useLayoutStore } from '../model/layout-store.ts';
import { publishReadiness } from '../model/layout-readiness.ts';

export function useSaveLayout(eventId: string, mode: 'publish' | 'draft' = 'publish') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['events', eventId, 'layout', mode],
    mutationFn: async (layout: BuildingLayout) => {
      if (mode === 'publish') {
        const issues = publishReadiness(layout);
        if (issues.length) {
          throw new Error(issues.join('\n'));
        }
      }
      return unwrapQueryResult(
        await (mode === 'draft' ? saveLayoutDraft : saveLayout)(eventId, layout),
      );
    },
    onSuccess: (_response, source) => {
      // A server draft is not the visitor document. Keep the publication dirty
      // guard so a background GET of that older document cannot erase new work.
      if (mode === 'draft') {
        return;
      }
      useLayoutStore.getState().markSaved(source);
      return queryClient.invalidateQueries({ queryKey: layoutQueryKey(eventId) });
    },
  });
}
