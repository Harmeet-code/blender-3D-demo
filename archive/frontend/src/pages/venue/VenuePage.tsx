import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIcon,
  Building2Icon,
  LogOutIcon,
  RefreshCwIcon,
  StoreIcon,
  UsersIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  acknowledgeEventLayout,
  clearAcceptedEventLayout,
  selectConfiguredEvent,
  useConfiguredEventId,
} from '@/app/config/constants.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { layoutQueryKey, useLayoutQuery } from '@/features/building/hooks/use-layout-query.ts';
import { getLayoutDraft } from '@/features/building/api/layouts-client.ts';
import {
  venueAuthStatus,
  venueCommand,
  venueCreateEvent,
  venueEvents,
  venueLogout,
  venueSession,
  venueSnapshot,
} from '@/features/venue/model/venue-client.ts';
import type {
  VenueCommand,
  VenueEvent,
  VenueSession,
  VenueSnapshot,
} from '@/features/venue/model/venue-contracts.ts';
import { VenueAccess } from '@/features/venue/components/VenueAccess.tsx';
import { VenueBooths } from '@/features/venue/components/VenueBooths.tsx';
import { VenueOrganizer } from '@/features/venue/components/VenueOrganizer.tsx';
import { VenueOperations } from '@/features/venue/components/VenueOperations.tsx';
import {
  VenueEmpty,
  VenueField,
  VenueInput,
  VenueMetric,
  VenuePanel,
  VenueSelect,
} from '@/features/venue/components/VenuePrimitives.tsx';

type Section = 'overview' | 'booths' | 'organizer' | 'operations';

export function VenuePage() {
  const eventId = useConfiguredEventId(),
    queryClient = useQueryClient();
  const layoutQuery = useLayoutQuery(eventId);
  const [session, setSession] = useState<VenueSession | null>(venueSession),
    [auth, setAuth] = useState<{ configured: boolean; bootstrapAllowed: boolean } | null>(null);
  const [events, setEvents] = useState<VenueEvent[]>([]),
    [snapshot, setSnapshot] = useState<VenueSnapshot | null>(null),
    [section, setSection] = useState<Section>('overview');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false);
  const [initialEventName, setInitialEventName] = useState(''),
    [draftReady, setDraftReady] = useState(false);
  const loadedDraft = useRef('');
  const generation = useRef(0),
    commandBusy = useRef(false);
  const selectedRef = useRef(eventId);
  selectedRef.current = eventId;
  const canOrganize = !!session && ['admin', 'organizer'].includes(session.user.role);
  const canOperate = !!session && ['admin', 'organizer', 'ops'].includes(session.user.role);
  const chooseEvent = useCallback((id: string) => {
    if (id === selectedRef.current) {
      return true;
    }
    if (useLayoutStore.getState().dirty) {
      setError('Save or discard your current editor changes before switching events.');
      return false;
    }
    generation.current++;
    setSnapshot(null);
    setDraftReady(false);
    loadedDraft.current = '';
    setError('');
    setNotice('');
    selectConfiguredEvent(id);
    return true;
  }, []);
  const loadAuth = useCallback(async () => {
    try {
      setAuth(await venueAuthStatus());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Venue server unavailable.');
    }
  }, []);
  useEffect(() => {
    void loadAuth();
  }, [loadAuth]);
  const refresh = useCallback(
    async (showLoading = false) => {
      if (!session) {
        return;
      }
      const currentGeneration = ++generation.current,
        selected = eventId;
      if (showLoading) {
        setLoading(true);
      }
      try {
        const available = await venueEvents();
        if (generation.current !== currentGeneration) {
          return;
        }
        setEvents(available);
        if (!available.some((item) => item.id === selected)) {
          setSnapshot(null);
          const first = available[0];
          if (first) {
            chooseEvent(first.id);
          }
          return;
        }
        const next = await venueSnapshot(selected);
        if (generation.current !== currentGeneration || selectedRef.current !== selected) {
          return;
        }
        const currentEditor = useLayoutStore.getState();
        if (
          loadedDraft.current !== selected &&
          currentEditor.dirty &&
          currentEditor.source.buildingId === selected &&
          ['admin', 'organizer'].includes(session.user.role)
        ) {
          // A previous authenticated session may retain unsaved edits after sign-out.
          // Re-authorize their event before accepting that private editor document again.
          const authorized = await getLayoutDraft(selected);
          if (generation.current !== currentGeneration || selectedRef.current !== selected) {
            return;
          }
          if (authorized.isErr()) {
            throw new Error(authorized.error.message);
          }
          acknowledgeEventLayout(selected);
          loadedDraft.current = selected;
          setDraftReady(true);
        }
        if (next.event.version === 0 && loadedDraft.current !== selected) {
          const draft = await getLayoutDraft(selected);
          if (generation.current !== currentGeneration || selectedRef.current !== selected) {
            return;
          }
          if (draft.isErr()) {
            throw new Error(draft.error.message);
          }
          if (!draft.value) {
            throw new Error('This unpublished event has no saved draft.');
          }
          if (useLayoutStore.getState().dirty) {
            throw new Error(
              'Save or discard current editor changes before opening this event draft.',
            );
          }
          const result = useLayoutStore.getState().update(draft.value);
          if (result.isErr()) {
            throw new Error(result.error.message);
          }
          useLayoutStore.setState({ dirty: true });
          acknowledgeEventLayout(selected);
          loadedDraft.current = selected;
          setDraftReady(true);
        }
        setSnapshot(next);
        setError('');
      } catch (cause) {
        if (generation.current === currentGeneration) {
          setError(cause instanceof Error ? cause.message : 'Venue could not be loaded.');
        }
      } finally {
        if (generation.current === currentGeneration) {
          setLoading(false);
        }
      }
    },
    [session, eventId, chooseEvent],
  );
  useEffect(() => {
    if (!session) {
      return;
    }
    void refresh(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !commandBusy.current) {
        void refresh();
      }
    }, 15_000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [session, refresh]);
  useEffect(() => {
    if ((section === 'organizer' && !canOrganize) || (section === 'operations' && !canOperate)) {
      setSection('overview');
    }
  }, [section, canOrganize, canOperate]);
  const execute = async (command: VenueCommand) => {
    if (commandBusy.current) {
      return;
    }
    commandBusy.current = true;
    setPending(true);
    setError('');
    setNotice('');
    generation.current++;
    const selected = eventId,
      source = useLayoutStore.getState().source;
    try {
      const next = await venueCommand(selected, command);
      if (selectedRef.current !== selected) {
        return;
      }
      setSnapshot(next);
      setNotice('Saved successfully.');
      if (command.type === 'publish') {
        useLayoutStore.getState().markSaved(source);
      }
      if (command.type === 'publish' || command.type === 'rollback') {
        await queryClient.invalidateQueries({ queryKey: layoutQueryKey(selected) });
      }
    } catch (cause) {
      if (selectedRef.current === selected) {
        setError(cause instanceof Error ? cause.message : 'This change could not be saved.');
      }
    } finally {
      commandBusy.current = false;
      setPending(false);
    }
  };
  const createEvent = async (name: string, templateId?: string) => {
    if (commandBusy.current) {
      return;
    }
    if (useLayoutStore.getState().dirty) {
      setError('Save or discard your current editor changes before creating and opening an event.');
      return;
    }
    commandBusy.current = true;
    setPending(true);
    setError('');
    generation.current++;
    try {
      const next = await venueCreateEvent(name, templateId);
      const available = await venueEvents();
      setEvents(available);
      if (chooseEvent(next.event.id)) {
        setSnapshot(next);
        setNotice(`Created ${next.event.name}.`);
      }
    } catch (cause) {
      if (selectedRef.current === eventId) {
        setError(cause instanceof Error ? cause.message : 'The event could not be created.');
      }
    } finally {
      commandBusy.current = false;
      setPending(false);
    }
  };
  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: Building2Icon },
    { id: 'booths' as const, label: 'Exhibitors', icon: StoreIcon },
    ...(canOrganize ? [{ id: 'organizer' as const, label: 'Organizer', icon: UsersIcon }] : []),
    ...(canOperate ? [{ id: 'operations' as const, label: 'Operations', icon: ActivityIcon }] : []),
  ];
  return (
    <main className="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto grid w-full max-w-6xl gap-5">
        {!session ? (
          <div className="py-6">
            {auth ? (
              <VenueAccess
                configured={auth.configured}
                bootstrapAllowed={auth.bootstrapAllowed}
                onSession={(next) => {
                  setSession(next);
                  setError('');
                  setAuth({ configured: true, bootstrapAllowed: false });
                }}
              />
            ) : (
              <VenuePanel title="Connecting to venue management">
                <p role="status" className="text-sm text-muted-foreground">
                  Checking server access…
                </p>
              </VenuePanel>
            )}
            {error && (
              <div
                role="alert"
                className="mx-auto mt-4 max-w-lg rounded-lg border border-destructive/40 p-3 text-sm"
              >
                <p>{error}</p>
                <Button className="mt-3" variant="outline" onClick={() => void loadAuth()}>
                  Retry connection
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Venue workspace</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {session.user.name} · {session.user.role} · durable event management
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={pending || loading}
                  onClick={() => void refresh(true)}
                >
                  <RefreshCwIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={async () => {
                    generation.current++;
                    let logoutNotice = '';
                    try {
                      await venueLogout();
                    } catch {
                      logoutNotice = 'Signed out locally; server logout could not be confirmed.';
                    }
                    clearAcceptedEventLayout(eventId);
                    setSession(null);
                    setSnapshot(null);
                    setEvents([]);
                    setError('');
                    setNotice(logoutNotice);
                    void loadAuth();
                  }}
                >
                  <LogOutIcon className="size-4" />
                  Sign out
                </Button>
              </div>
            </header>
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-64 flex-1">
                <VenueSelect
                  label="Active event"
                  value={events.some((item) => item.id === eventId) ? eventId : ''}
                  onChange={chooseEvent}
                  disabled={pending}
                  options={
                    events.length
                      ? events.map((item) => ({ value: item.id, label: item.name }))
                      : [{ value: '', label: 'No accessible events' }]
                  }
                />
              </div>
              <a href="#/world" className="rounded-md border px-4 py-2 text-sm">
                Open 3D venue
              </a>
              {canOrganize && (
                <a href="#/admin" className="rounded-md border px-4 py-2 text-sm">
                  Open venue studio
                </a>
              )}
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
              >
                {error}
              </div>
            )}
            {notice && (
              <p
                role="status"
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm"
              >
                {notice}
              </p>
            )}
            <nav
              aria-label="Venue workspace sections"
              className="flex gap-2 overflow-x-auto border-b pb-3"
            >
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={section === tab.id ? 'default' : 'outline'}
                  aria-current={section === tab.id ? 'page' : undefined}
                  onClick={() => setSection(tab.id)}
                >
                  <tab.icon className="size-4" />
                  {tab.label}
                </Button>
              ))}
            </nav>
            {loading && !snapshot && (
              <p role="status" className="p-4 text-sm text-muted-foreground">
                Loading event workspace…
              </p>
            )}
            {snapshot && snapshot.event.id === eventId ? (
              <>
                {section === 'overview' && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <VenueMetric label="Published version" value={snapshot.event.version} />
                      <VenueMetric label="Booths" value={snapshot.booths.length} />
                      <VenueMetric
                        label="Confirmed bookings"
                        value={
                          snapshot.bookings.filter((booking) => booking.status === 'confirmed')
                            .length
                        }
                      />
                      <VenueMetric
                        label="Open operations"
                        value={
                          snapshot.operations.filter((operation) => !operation.resolvedAt).length
                        }
                      />
                    </div>
                    <VenuePanel
                      title={snapshot.event.name}
                      description="Manage inventory and operations using the same event and booth IDs as your floor plan."
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button variant="outline" onClick={() => setSection('booths')}>
                          View booth availability
                        </Button>
                        {canOrganize && (
                          <Button variant="outline" onClick={() => setSection('organizer')}>
                            Publish layouts and manage the team
                          </Button>
                        )}
                        {canOperate && (
                          <Button variant="outline" onClick={() => setSection('operations')}>
                            View operations and signage
                          </Button>
                        )}
                      </div>
                    </VenuePanel>
                    <VenuePanel
                      title="Wayfinding analytics"
                      description="Aggregate counts recorded by this event. These are actual application events; no synthetic traffic is included."
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        <VenueMetric label="Searches" value={snapshot.analytics.searches} />
                        <VenueMetric label="Routes" value={snapshot.analytics.routes} />
                        <VenueMetric
                          label="Dwell time"
                          value={`${Math.round(snapshot.analytics.dwellSeconds / 60)} min`}
                          hint="Recorded by active sessions"
                        />
                      </div>
                    </VenuePanel>
                    <p className="text-xs text-muted-foreground">
                      Online payments require a provider integration. AR is an experimental camera
                      feature and does not provide indoor positioning.
                    </p>
                  </>
                )}
                {section === 'booths' && (
                  <VenueBooths
                    snapshot={snapshot}
                    session={session}
                    execute={execute}
                    pending={pending}
                  />
                )}
                {section === 'organizer' && canOrganize && (
                  <VenueOrganizer
                    snapshot={snapshot}
                    session={session}
                    events={events}
                    execute={execute}
                    createEvent={createEvent}
                    pending={
                      pending ||
                      (snapshot.event.version === 0
                        ? !draftReady
                        : layoutQuery.isPending || layoutQuery.isError)
                    }
                  />
                )}
                {section === 'operations' && canOperate && (
                  <VenueOperations
                    key={eventId}
                    snapshot={snapshot}
                    execute={execute}
                    pending={pending}
                  />
                )}
              </>
            ) : (
              !loading &&
              (canOrganize ? (
                <VenuePanel
                  title="Create your first event"
                  description="Start with a calibrated blank floor. Add rooms and booths in the venue studio, then publish to open bookings."
                >
                  <form
                    className="grid gap-3 sm:grid-cols-[1fr_auto]"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await createEvent(initialEventName);
                    }}
                  >
                    <VenueField label="Event name">
                      <VenueInput
                        required
                        maxLength={120}
                        value={initialEventName}
                        onChange={(event) => setInitialEventName(event.target.value)}
                        placeholder="My exhibition"
                      />
                    </VenueField>
                    <Button disabled={pending || !initialEventName.trim()} className="self-end">
                      Create event
                    </Button>
                  </form>
                </VenuePanel>
              ) : (
                <VenueEmpty>
                  No event is assigned to this account. Ask an administrator to grant access.
                </VenueEmpty>
              ))
            )}
          </>
        )}
      </div>
    </main>
  );
}
