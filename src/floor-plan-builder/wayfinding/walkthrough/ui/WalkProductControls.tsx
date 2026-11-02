import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { usePlaybackStore } from '../../store/playback-store.ts';
import type { Role } from '../contracts.ts';

/** Compact runtime control surface for the walkthrough overlay or sidebar. */
export function WalkProductControls({
  role,
  onRoleChange,
}: {
  role: Role;
  onRoleChange: (role: Role) => void;
}) {
  const session = usePlaybackStore((state) => state.session);
  const status = usePlaybackStore((state) => state.status);
  const mode = usePlaybackStore((state) => state.mode);
  const speed = usePlaybackStore((state) => state.speed);
  const comfort = usePlaybackStore((state) => state.comfort);
  useEffect(() => {
    if (session && mode === 'overview') {
      usePlaybackStore.getState().setMode('first');
    }
  }, [session, mode]);
  if (!session) {
    return null;
  }

  const walking = status === 'playing';
  return (
    <section aria-label="Walkthrough controls" className="flex flex-col gap-3 rounded-xl border bg-background/95 p-3 text-foreground shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Walkthrough</h2>
          <p className="text-xs text-muted-foreground">{walking ? 'Auto-walk is active' : status === 'arrived' ? 'Destination reached' : 'Auto-walk paused'}</p>
        </div>
        <Button
          size="sm"
          variant={walking ? 'destructive' : 'default'}
          disabled={status === 'arrived'}
          onClick={() => usePlaybackStore.getState().toggle()}
          aria-label={walking ? 'Stop auto-walk' : 'Resume auto-walk'}
        >
          {walking ? 'Stop auto-walk' : status === 'arrived' ? 'Arrived' : 'Resume auto-walk'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="walk-role">Demo role</FieldLabel>
          <select id="walk-role" value={role} onChange={(event) => onRoleChange(event.target.value as Role)}>
            <option value="visitor">Visitor</option>
            <option value="staff">Staff</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="walk-view">Camera view</FieldLabel>
          <select id="walk-view" value={mode === 'chase' ? 'chase' : 'first'} onChange={(event) => usePlaybackStore.getState().setMode(event.target.value as 'chase' | 'first')}>
            <option value="first">First person</option>
            <option value="chase">Third person</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="walk-speed">Walk speed</FieldLabel>
          <select id="walk-speed" value={speed} onChange={(event) => usePlaybackStore.getState().setSpeed(Number(event.target.value))}>
            {[0.5, 1, 2, 4].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </Field>
        <Field orientation="horizontal">
          <Switch id="walk-comfort" checked={comfort} onCheckedChange={(value) => usePlaybackStore.getState().setComfort(value)} />
          <FieldLabel htmlFor="walk-comfort">Comfort motion</FieldLabel>
        </Field>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Keyboard help</summary>
        <p className="mt-2 text-sm text-muted-foreground">Space pauses or resumes · Left/Right arrows scrub · Esc stops auto-walk and returns control to free-walk. Exit walkthrough leaves walk mode.</p>
      </details>
      <Button size="sm" variant="outline" onClick={() => usePlaybackStore.getState().exit()}>Exit walkthrough</Button>
    </section>
  );
}
