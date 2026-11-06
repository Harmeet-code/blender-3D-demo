import { createContext, type ReactNode } from 'react';
import type { Follower } from './follower.ts';
import { usePlaybackStore } from '../store/playback-store.ts';

/** Ephemeral door/cabin motion never enters authoring history or saved layout data. */
export const TraversalMotionContext = createContext<Follower | null>(null);
export const WalkModeContext = createContext(false);
export function PlaybackMotionProvider({ children }: { children: ReactNode }) {
  const runtime = usePlaybackStore((state) => state.session?.runtime ?? null);
  const walkMode = usePlaybackStore(
    (state) => state.session !== null && state.mode !== 'overview',
  );
  return (
    <TraversalMotionContext.Provider value={runtime}>
      <WalkModeContext.Provider value={walkMode}>{children}</WalkModeContext.Provider>
    </TraversalMotionContext.Provider>
  );
}
