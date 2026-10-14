import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { publishReadiness } from '@/features/building/model/layout-readiness.ts';
import { acceptedLayoutVersion } from '@/features/building/api/layouts-client.ts';
import type {
  VenueEvent,
  VenueRole,
  VenueSession,
  VenueSnapshot,
} from '../model/venue-contracts.ts';
import type { VenueExecute } from './VenueBooths.tsx';
import {
  VenueAction,
  VenueEmpty,
  VenueField,
  VenueInput,
  VenuePanel,
  VenueSelect,
  venueDate,
} from './VenuePrimitives.tsx';

export function VenueOrganizer({
  snapshot,
  session,
  events,
  execute,
  createEvent,
  pending,
}: {
  snapshot: VenueSnapshot;
  session: VenueSession;
  events: VenueEvent[];
  execute: VenueExecute;
  createEvent: (name: string, templateId?: string) => Promise<void>;
  pending: boolean;
}) {
  const source = useLayoutStore((state) => state.source),
    dirty = useLayoutStore((state) => state.dirty);
  const issues = useMemo(() => publishReadiness(source), [source]);
  const [eventName, setEventName] = useState(''),
    [templateId, setTemplateId] = useState(''),
    [publishConfirm, setPublishConfirm] = useState(false),
    [rollbackConfirm, setRollbackConfirm] = useState('');
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [role, setRole] = useState<VenueRole>('exhibitor'),
    [allEvents, setAllEvents] = useState(false);
  const [editingUserId, setEditingUserId] = useState(''),
    [editRole, setEditRole] = useState<VenueRole>('exhibitor'),
    [editEventIds, setEditEventIds] = useState<string[]>([]),
    [resetPassword, setResetPassword] = useState('');
  return (
    <div className="grid gap-5">
      <VenuePanel
        title="Create an event"
        description="Start with a blank venue or copy another event’s published layout as a template. Bookings, claims and operations are isolated for the new event."
      >
        <form
          className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={async (event) => {
            event.preventDefault();
            await createEvent(eventName, templateId || undefined);
            setEventName('');
          }}
        >
          <VenueField label="Event name">
            <VenueInput
              required
              maxLength={120}
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="Autumn Exhibition 2026"
            />
          </VenueField>
          <VenueSelect
            label="Layout template"
            value={templateId}
            onChange={setTemplateId}
            options={[
              { value: '', label: 'Blank metric floor' },
              ...events
                .filter((item) => item.version > 0)
                .map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <Button disabled={pending || !eventName.trim()}>Create event</Button>
        </form>
      </VenuePanel>
      <VenuePanel
        title="Publish and restore"
        description={`Current published version: ${snapshot.event.version}. Publication validates calibration, starts, portals and clearance before changing the live venue.`}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {dirty ? 'Editor has unpublished changes' : 'Editor has no unsaved changes'}
          </span>
          <a href="#/admin" className="text-sm underline underline-offset-4">
            Open venue studio
          </a>
        </div>
        {issues.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">Resolve these before publishing</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {issues.slice(0, 8).map((issue, index) => (
                <li key={index}>{typeof issue === 'string' ? issue : JSON.stringify(issue)}</li>
              ))}
            </ul>
            {issues.length > 8 && <p className="mt-2 text-xs">And {issues.length - 8} more.</p>}
          </div>
        )}
        {!publishConfirm ? (
          <Button disabled={pending || issues.length > 0} onClick={() => setPublishConfirm(true)}>
            Publish editor layout
          </Button>
        ) : (
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
            <p className="text-sm">
              Publish the current editor layout to {snapshot.event.name}? A new immutable version
              will be recorded.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || issues.length > 0}
                onClick={async () => {
                  await execute({
                    type: 'publish',
                    layout: useLayoutStore.getState().source,
                    expectedVersion: acceptedLayoutVersion(snapshot.event.id),
                  });
                  setPublishConfirm(false);
                }}
              >
                Confirm publication
              </Button>
              <Button disabled={pending} variant="outline" onClick={() => setPublishConfirm(false)}>
                Keep editing
              </Button>
            </div>
          </div>
        )}
        <div className="mt-5 grid gap-2">
          {!snapshot.versions.length ? (
            <VenueEmpty>
              No version history yet. Publish a validated layout to record the first version.
            </VenueEmpty>
          ) : (
            snapshot.versions
              .slice()
              .reverse()
              .map((version) => (
                <div
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Version {version.number}
                      {version.restoredFrom ? ' · restored snapshot' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {venueDate(version.createdAt)} ·{' '}
                      {snapshot.users?.find((user) => user.id === version.userId)?.name ??
                        version.userId}
                    </p>
                  </div>
                  {version.number < snapshot.event.version && (
                    <VenueAction disabled={pending} onClick={() => setRollbackConfirm(version.id)}>
                      Restore version
                    </VenueAction>
                  )}
                  {rollbackConfirm === version.id && (
                    <div className="w-full border-t pt-3">
                      <p className="mb-2 text-sm">
                        Restore version {version.number} as a new publication? Current unpublished
                        editor changes will remain in the editor until you reload.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          disabled={pending}
                          onClick={async () => {
                            await execute({
                              type: 'rollback',
                              versionId: version.id,
                              expectedVersion: snapshot.event.version,
                            });
                            setRollbackConfirm('');
                          }}
                        >
                          Confirm restore
                        </Button>
                        <Button
                          disabled={pending}
                          variant="outline"
                          onClick={() => setRollbackConfirm('')}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      </VenuePanel>
      {session.user.role === 'admin' && (
        <VenuePanel
          title="Team access"
          description="Create organizer, exhibitor or operations accounts. Only administrators can manage accounts; access is enforced by the server."
        >
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await execute({
                type: 'create-user',
                name: username,
                password,
                role,
                eventIds: allEvents ? events.map((item) => item.id) : [snapshot.event.id],
              });
              setPassword('');
              setUsername('');
            }}
          >
            <VenueField label="Username">
              <VenueInput
                autoComplete="off"
                required
                maxLength={120}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </VenueField>
            <VenueField label="Initial password">
              <VenueInput
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={200}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </VenueField>
            <VenueSelect
              label="Role"
              value={role}
              onChange={(value) => setRole(value as VenueRole)}
              options={['organizer', 'exhibitor', 'ops', 'admin'].map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              }))}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={allEvents}
                onChange={(event) => setAllEvents(event.target.checked)}
              />
              Grant all currently listed events
            </label>
            <Button disabled={pending} className="w-fit">
              Create account
            </Button>
          </form>
          <div className="mt-4 grid gap-2">
            {snapshot.users?.map((user) => (
              <div key={user.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {user.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {user.role}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.role === 'admin'
                        ? 'All events'
                        : `${user.eventIds.length} assigned event(s)`}
                    </p>
                  </div>
                  {editingUserId !== user.id && (
                    <VenueAction
                      disabled={pending}
                      onClick={() => {
                        setEditingUserId(user.id);
                        setEditRole(user.role);
                        setEditEventIds(user.eventIds);
                        setResetPassword('');
                      }}
                    >
                      Edit access
                    </VenueAction>
                  )}
                </div>
                {editingUserId === user.id && (
                  <form
                    className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await execute({
                        type: 'update-user',
                        userId: user.id,
                        role: editRole,
                        eventIds: editRole === 'admin' ? [] : editEventIds,
                        ...(resetPassword ? { password: resetPassword } : {}),
                      });
                      setEditingUserId('');
                      setResetPassword('');
                    }}
                  >
                    <VenueSelect
                      label="Role"
                      value={editRole}
                      onChange={(value) => setEditRole(value as VenueRole)}
                      options={['organizer', 'exhibitor', 'ops', 'admin'].map((value) => ({
                        value,
                        label: value.charAt(0).toUpperCase() + value.slice(1),
                      }))}
                    />
                    {user.id !== session.user.id ? (
                      <VenueField label="Reset password (optional)">
                        <VenueInput
                          type="password"
                          autoComplete="new-password"
                          minLength={resetPassword ? 12 : undefined}
                          maxLength={200}
                          value={resetPassword}
                          onChange={(event) => setResetPassword(event.target.value)}
                          placeholder="Leave blank to keep current password"
                        />
                      </VenueField>
                    ) : (
                      <p className="self-end text-xs text-muted-foreground">
                        Your own password can’t be changed here because it would sign out this
                        session.
                      </p>
                    )}
                    {editRole !== 'admin' && (
                      <fieldset className="grid gap-2 sm:col-span-2">
                        <legend className="mb-1 text-xs font-medium text-muted-foreground">
                          Event access
                        </legend>
                        {events.map((item) => (
                          <label key={item.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editEventIds.includes(item.id)}
                              onChange={(event) =>
                                setEditEventIds((current) =>
                                  event.target.checked
                                    ? [...new Set([...current, item.id])]
                                    : current.filter((id) => id !== item.id),
                                )
                              }
                            />
                            {item.name}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <div className="flex gap-2 sm:col-span-2">
                      <Button disabled={pending}>Save access</Button>
                      <Button
                        type="button"
                        disabled={pending}
                        variant="outline"
                        onClick={() => {
                          setEditingUserId('');
                          setResetPassword('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </VenuePanel>
      )}
      <VenuePanel
        title="Audit history"
        description="Server-recorded management actions. This history survives page refreshes and event switches."
      >
        {!snapshot.audit.length ? (
          <VenueEmpty>No management actions recorded yet.</VenueEmpty>
        ) : (
          <ol className="max-h-96 space-y-2 overflow-auto">
            {snapshot.audit
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {entry.action}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {entry.subjectId}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {venueDate(entry.at)} ·{' '}
                    {snapshot.users?.find((user) => user.id === entry.userId)?.name ?? entry.userId}
                  </p>
                </li>
              ))}
          </ol>
        )}
      </VenuePanel>
    </div>
  );
}
