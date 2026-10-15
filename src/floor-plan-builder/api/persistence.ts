import {
  getLayout,
  getLayoutDraft,
  saveLayout,
  saveLayoutDraft,
  acceptLayoutVersion,
} from '@/features/building/api/layouts-client.ts';
import { publishReadiness } from '@/features/building/model/layout-readiness.ts';
import { decodeLayout, encodeLayout } from '../model/adapter.ts';
import {
  activeFloor,
  unfinished,
  type StudioStore,
  type PublicationIssue,
} from '../model/store.ts';
import { placementError } from '../model/geometry.ts';
import type { BuildingLayout } from '@/features/building/model/building-schema.ts';
import { isConnector } from '../model/types.ts';

export const localDraftKey = (eventId: string) =>
  `floor-plan-builder:v1:${encodeURIComponent(eventId)}`;
export class StudioPersistence {
  private queue: Promise<void> = Promise.resolve();
  private loadSequence = 0;
  private publishing = false;
  constructor(
    private eventId: string,
    private store: StudioStore,
  ) {}
  async load(signal?: AbortSignal, replaceDirty = false) {
    if (this.publishing) {
      this.store.getState().notify('Wait for publication to finish before reloading.');
      return { draft: null, published: null };
    }
    const sequence = ++this.loadSequence;
    const initialRevision = this.store.getState().revision;
    const [published, draft] = await Promise.all([
      getLayout(this.eventId, { signal }),
      getLayoutDraft(this.eventId, { signal }),
    ]);
    const current = this.store.getState();
    if (
      signal?.aborted ||
      sequence !== this.loadSequence ||
      this.publishing ||
      current.revision !== initialRevision
    ) {
      return { draft: null, published: null };
    }
    if (unfinished(current) || (!replaceDirty && current.revision !== current.savedRevision)) {
      return {
        draft: draft.isOk() ? draft.value : null,
        published: published.isOk() ? published.value : null,
      };
    }
    let publishedDocument: BuildingLayout | null = null;
    if (published.isOk()) {
      const document = decodeLayout(published.value);
      if (document.baseline.buildingId !== this.eventId) {
        throw new Error('The server returned another event. The current workspace was preserved.');
      }
      acceptLayoutVersion(this.eventId, published.value);
      this.store.getState().load(document);
      publishedDocument = published.value;
    } else if (published.error.status !== 404) {
      this.store.setState({ saveState: 'Error' });
      this.store
        .getState()
        .notify(
          'Could not load the published event. Your local workspace is preserved; check the server or sign in.',
        );
    }
    return { draft: draft.isOk() ? draft.value : null, published: publishedDocument };
  }
  saveDraft(): Promise<void> {
    const state = this.store.getState(),
      { revision, documentEpoch } = state;
    let snapshot: BuildingLayout;
    try {
      snapshot = encodeLayout(state.document);
    } catch (error) {
      this.store.setState({
        saveState: 'Error',
        message: error instanceof Error ? error.message : 'Invalid document.',
      });
      return Promise.resolve();
    }
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        if (this.store.getState().documentEpoch !== documentEpoch) {
          return;
        }
        this.store.setState({ saveState: 'Saving' });
        const result = await saveLayoutDraft(this.eventId, snapshot);
        if (this.store.getState().documentEpoch !== documentEpoch) {
          return;
        }
        if (result.isOk() && result.value.saved) {
          this.store.getState().markSaved(revision);
        } else {
          this.store.setState({
            saveState: 'Error',
            message: result.isErr()
              ? result.error.status === 401 || result.error.status === 403
                ? 'Sign in to save this event. Local edits are preserved.'
                : 'Draft save failed. Local edits are preserved; use Retry save.'
              : 'The server did not acknowledge the save.',
          });
        }
      });
    return this.queue;
  }
  async finalize(): Promise<boolean> {
    if (this.publishing) {
      this.store.getState().notify('Publication is already in progress.');
      return false;
    }
    this.publishing = true;
    this.loadSequence++;
    try {
      return await this.publishSnapshot();
    } finally {
      this.publishing = false;
    }
  }
  private async publishSnapshot(): Promise<boolean> {
    const state = this.store.getState();
    if (unfinished(state)) {
      state.notify('Apply or discard the unfinished edit before finalizing.');
      return false;
    }
    let snapshot: BuildingLayout;
    try {
      snapshot = encodeLayout(state.document);
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'Invalid document.');
      return false;
    }
    const errors: PublicationIssue[] = [
      ...publishReadiness(snapshot).map((message) => ({
        floorId: state.document.floors.find((floor) => message.startsWith(`${floor.source.name}:`))
          ?.source.id,
        message,
      })),
      ...state.document.floors.flatMap((floor) =>
        floor.objects
          .filter((object) => object.managed && isConnector(object.recipe))
          .flatMap((object) => {
            const floors = new Set(
              state.document.floors
                .filter((item) =>
                  item.objects.some(
                    (candidate) => candidate.portalId && candidate.portalId === object.portalId,
                  ),
                )
                .map((item) => item.source.id),
            );
            return floors.size < 2
              ? [
                  {
                    floorId: floor.source.id,
                    objectId: object.id,
                    message: `${object.name}: connect and position landings on at least two floors.`,
                  },
                ]
              : [];
          }),
      ),
      ...state.document.floors.flatMap((floor) =>
        floor.objects
          .filter((object) => object.managed)
          .flatMap((object) => {
            const message = placementError(object, floor);
            return message
              ? [
                  {
                    floorId: floor.source.id,
                    objectId: object.id,
                    message: `${object.name}: ${message}`,
                  },
                ]
              : [];
          }),
      ),
    ];
    if (errors.length) {
      this.store.setState({
        publicationIssues: {
          revision: state.revision,
          entries: errors.filter(
            (issue, index) =>
              errors.findIndex(
                (other) =>
                  other.floorId === issue.floorId &&
                  other.objectId === issue.objectId &&
                  other.message === issue.message,
              ) === index,
          ),
        },
      });
      state.notify(
        `Finalize blocked by ${errors.length} issue(s). Review the publication issues panel.`,
      );
      return false;
    }
    this.store.setState({ publicationIssues: null });
    const { revision, documentEpoch } = state;
    await this.saveDraft();
    if (
      this.store.getState().revision !== revision ||
      this.store.getState().documentEpoch !== documentEpoch ||
      unfinished(this.store.getState()) ||
      this.store.getState().saveState !== 'Saved'
    ) {
      this.store
        .getState()
        .notify('New edits or a failed draft save require saving again before finalizing.');
      return false;
    }
    const result = await saveLayout(this.eventId, snapshot);
    if (this.store.getState().documentEpoch !== documentEpoch) {
      return result.isOk() && result.value.saved;
    }
    if (result.isErr()) {
      const { status } = result.error;
      this.store.setState({
        saveState: 'Error',
        message:
          status === 409
            ? 'Publication conflict. Keep your draft, then explicitly reload/compare the published event.'
            : status === 401 || status === 403
              ? 'Sign in with administrator access to finalize.'
              : status === 428
                ? 'Load the published event version before finalizing.'
                : 'Finalization failed. Your draft remains saved; check readiness and retry.',
      });
      return false;
    }
    if (!result.value.saved) {
      this.store.getState().notify('The server did not acknowledge publication.');
      return false;
    }
    // saveLayout owns version advancement. Never accept an old fetched snapshot here.
    this.store.getState().markSaved(revision);
    this.store.getState().notify('Layout finalized.');
    return true;
  }
  currentFloor() {
    return activeFloor(this.store.getState());
  }
}
