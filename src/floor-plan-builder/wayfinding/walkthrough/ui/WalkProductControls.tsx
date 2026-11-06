import { useEffect } from 'react';
import { ChevronDown, Keyboard, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePlaybackStore } from '../../store/playback-store.ts';
import type { Role } from '../contracts.ts';

/** Compact runtime control surface for the walkthrough overlay or sidebar. */
export function WalkProductControls({
  role,
  onRoleChange,
}: {
  role?: Role;
  onRoleChange?: (role: Role) => void;
}) {
  const session = usePlaybackStore((state) => state.session);
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

  const { route } = session;
  return (
    <Collapsible
      aria-label="Walkthrough settings"
      className="group/walk-settings w-full rounded-lg border bg-card/50"
    >
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="w-full justify-between">
          <span className="flex items-center gap-1.5">
            <Settings2 data-icon="inline-start" aria-hidden />
            Walk settings
          </span>
          <ChevronDown
            data-icon="inline-end"
            className="transition-transform group-data-[state=open]/walk-settings:rotate-180"
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 px-3 pb-3 pt-1">
        <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {route && role && onRoleChange && (
            <Field>
              <FieldLabel htmlFor="walk-role">Demo role</FieldLabel>
              <Select value={role} disabled onValueChange={(value) => onRoleChange(value as Role)}>
                <SelectTrigger id="walk-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    <SelectItem value="visitor">Visitor</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>Locked for this walkthrough.</FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="walk-view">Camera view</FieldLabel>
            <Select
              value={mode === 'chase' ? 'chase' : 'first'}
              onValueChange={(value) =>
                usePlaybackStore.getState().setMode(value as 'chase' | 'first')
              }
            >
              <SelectTrigger id="walk-view" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value="first">First person</SelectItem>
                  <SelectItem value="chase">Third person</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="walk-speed">Walk speed</FieldLabel>
            <Select
              value={String(speed)}
              onValueChange={(value) => usePlaybackStore.getState().setSpeed(Number(value))}
            >
              <SelectTrigger id="walk-speed" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {[0.5, 1, 2, 4].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}×
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal" className="sm:col-span-2">
            <Switch
              id="walk-comfort"
              checked={comfort}
              onCheckedChange={(value) => usePlaybackStore.getState().setComfort(value)}
            />
            <FieldContent>
              <FieldLabel htmlFor="walk-comfort">Comfort motion</FieldLabel>
              <FieldDescription>Reduces camera movement and HUD animation.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>

        <details className="group/keyboard rounded-lg bg-muted/50 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Keyboard aria-hidden />
              Keyboard help
            </span>
            <ChevronDown
              className="transition-transform group-open/keyboard:rotate-180"
              aria-hidden
            />
          </summary>
          <dl className="mt-3 grid gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt>Move or take control</dt>
              <dd>
                <KbdGroup>
                  <Kbd>WASD</Kbd>
                  <span>or</span>
                  <Kbd>Arrows</Kbd>
                </KbdGroup>
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt>Stop or recalculate</dt>
              <dd>
                <Kbd>Space</Kbd>
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt>Stop auto-walk</dt>
              <dd>
                <Kbd>Esc</Kbd>
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt>Switch camera</dt>
              <dd>
                <Kbd>V</Kbd>
              </dd>
            </div>
          </dl>
        </details>
      </CollapsibleContent>
    </Collapsible>
  );
}
