import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { BuildingLayout } from '../../../features/building/model/building-schema.ts';
import { publishReadiness } from '../../../features/building/model/layout-readiness.ts';
import { blankFloor } from '../../../features/layout-editor/model/floor-drafts.ts';
import { normalizeLayout } from '../../../features/building/model/normalize-layout.ts';
import { pointInPolygon } from '../../../utils/geometry/polygon.ts';
import { getNavigationDestinations } from '../../../features/navigation/model/navigation-destinations.ts';
import type {
  VenueAudit,
  VenueBooking,
  VenueBooth,
  VenueCommand,
  VenueEvent,
  VenueHold,
  VenueInvoice,
  VenueOperation,
  VenueSession,
  VenueSignage,
  VenueSnapshot,
  VenueUser,
  VenueVersion,
  VenuePublicView,
} from '../../../features/venue/model/venue-contracts.ts';

interface StoredUser extends VenueUser {
  passwordHash: string;
}
interface StoredEvent extends VenueEvent {
  layout?: BuildingLayout;
  draft?: BuildingLayout;
  booths: VenueBooth[];
  holds: VenueHold[];
  bookings: VenueBooking[];
  invoices: VenueInvoice[];
  versions: (VenueVersion & { layout: BuildingLayout })[];
  audit: VenueAudit[];
  operations: VenueOperation[];
  signage: VenueSignage[];
  analytics: VenueSnapshot['analytics'];
}
interface State {
  format: 1;
  users: StoredUser[];
  sessions: { digest: string; userId: string; expiresAt: number }[];
  events: StoredEvent[];
}
const root = resolve(process.env.VENUE_DATA_DIR ?? 'data/venue');
const file = join(root, 'state.json');
const lock = join(root, '.writer.lock');
export class VenueError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new VenueError(status, message);
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const passwordHash = (value: string, salt = randomBytes(16).toString('hex')) =>
  `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
function passwordMatches(value: string, hash: string): boolean {
  const [salt, encoded] = hash.split(':');
  if (!salt || !encoded) {
    return false;
  }
  const actual = scryptSync(value, salt, 64);
  const expected = Buffer.from(encoded, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function publicUser(user: VenueUser): VenueUser {
  return { id: user.id, name: user.name, role: user.role, eventIds: [...user.eventIds] };
}
async function read(): Promise<State> {
  try {
    const state = JSON.parse(await readFile(file, 'utf8')) as State;
    if (
      state.format !== 1 ||
      !Array.isArray(state.users) ||
      !Array.isArray(state.sessions) ||
      !Array.isArray(state.events)
    ) {
      throw new Error('Unsupported Venue OS state');
    }
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { format: 1, users: [], sessions: [], events: [] };
    }
    throw error;
  }
}
/** Exclusive filesystem lock covers read-modify-write across local server processes. Never removes another writer's lock. */
export async function transaction<T>(change: (state: State) => T | Promise<T>): Promise<T> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 5000;
  let handle;
  while (!handle) {
    try {
      handle = await open(lock, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() >= deadline) {
        fail(
          503,
          'Venue storage is busy; retry. A crashed writer lock requires operator recovery.',
        );
      }
      await new Promise((done) => setTimeout(done, 40));
    }
  }
  const temporary = join(root, `state.${randomUUID()}.tmp`);
  try {
    const state = await read();
    state.sessions = state.sessions.filter((item) => item.expiresAt > Date.now());
    for (const event of state.events) {
      for (const hold of event.holds) {
        if (hold.status === 'active' && Date.parse(hold.expiresAt) <= Date.now()) {
          hold.status = 'expired';
        }
      }
    }
    const result = await change(state);
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    const output = await open(temporary, 'r+');
    try {
      await output.sync();
    } finally {
      await output.close();
    }
    await rename(temporary, file);
    return result;
  } finally {
    await rm(temporary, { force: true });
    await handle.close();
    await rm(lock);
  }
}
function authenticate(state: State, token: string | undefined): StoredUser {
  if (!token) {
    fail(401, 'Sign in to Venue OS.');
  }
  const session = state.sessions.find(
    (item) => item.digest === digest(token) && item.expiresAt > Date.now(),
  );
  const user = state.users.find((item) => item.id === session?.userId);
  if (!user) {
    fail(401, 'Session expired. Sign in again.');
  }
  return user;
}
function scope(user: VenueUser, eventId: string): void {
  if (user.role !== 'admin' && !user.eventIds.includes(eventId)) {
    fail(403, 'This event is outside your assigned access.');
  }
}
function role(user: VenueUser, allowed: VenueUser['role'][]): void {
  if (!allowed.includes(user.role)) {
    fail(403, 'Your role cannot perform this action.');
  }
}
function session(state: State, user: StoredUser): VenueSession {
  const token = randomBytes(32).toString('base64url');
  state.sessions.push({
    digest: digest(token),
    userId: user.id,
    expiresAt: Date.now() + 8 * 3600000,
  });
  return { token, user: publicUser(user) };
}
export async function authStatus(): Promise<{ configured: boolean }> {
  return { configured: (await read()).users.length > 0 };
}
export async function bootstrap(name: string, password: string): Promise<VenueSession> {
  return transaction((state) => {
    if (state.users.length) {
      fail(409, 'Administrator already configured. Sign in.');
    }
    const user: StoredUser = {
      id: randomUUID(),
      name,
      role: 'admin',
      eventIds: [],
      passwordHash: passwordHash(password),
    };
    state.users.push(user);
    return session(state, user);
  });
}
export async function login(name: string, password: string): Promise<VenueSession> {
  return transaction((state) => {
    const user = state.users.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const hash =
      user?.passwordHash ??
      passwordHash('unavailable-password', '00000000000000000000000000000000');
    if (!passwordMatches(password, hash) || !user) {
      fail(401, 'Invalid sign-in credentials.');
    }
    return session(state, user);
  });
}
export async function logout(token: string | undefined): Promise<void> {
  await transaction((state) => {
    authenticate(state, token);
    state.sessions = state.sessions.filter((item) => item.digest !== digest(token!));
  });
}
export async function authorize(
  token: string | undefined,
  eventId: string,
  allowed: VenueUser['role'][],
): Promise<VenueUser> {
  const state = await read();
  const user = authenticate(state, token);
  if (eventId) {
    scope(user, eventId);
  }
  role(user, allowed);
  return publicUser(user);
}
function newEvent(id: string, name: string): StoredEvent {
  return {
    id,
    name,
    createdAt: new Date().toISOString(),
    version: 0,
    booths: [],
    holds: [],
    bookings: [],
    invoices: [],
    versions: [],
    audit: [],
    operations: [],
    signage: [],
    analytics: { searches: 0, routes: 0, dwellSeconds: 0 },
  };
}
function eventFor(state: State, id: string): StoredEvent {
  const event = state.events.find((item) => item.id === id);
  if (!event) {
    fail(404, 'Event not found. Import the current layout or create an event.');
  }
  return event;
}
function snapshot(state: State, event: StoredEvent, user: VenueUser): VenueSnapshot {
  const exhibitor = user.role === 'exhibitor';
  const operationsUser = user.role === 'ops';
  return {
    event: { id: event.id, name: event.name, createdAt: event.createdAt, version: event.version },
    booths: event.booths.map((booth) => {
      const { ownerId, ...privateBooth } = booth;
      return {
        ...privateBooth,
        ...(ownerId && ((!exhibitor && !operationsUser) || ownerId === user.id) ? { ownerId } : {}),
        status: boothStatus(event, booth),
        claimUserIds: exhibitor
          ? booth.claimUserIds.filter((id) => id === user.id)
          : operationsUser
            ? []
            : booth.claimUserIds,
      };
    }),
    holds: operationsUser
      ? []
      : event.holds.filter((hold) => !exhibitor || hold.userId === user.id),
    bookings: operationsUser
      ? []
      : event.bookings.filter((booking) => !exhibitor || booking.userId === user.id),
    invoices: operationsUser
      ? []
      : event.invoices.filter((invoice) => !exhibitor || invoice.userId === user.id),
    versions:
      exhibitor || operationsUser
        ? []
        : event.versions.map(({ layout: _layout, ...version }) => version),
    audit: exhibitor || operationsUser ? [] : event.audit.slice(-200).reverse(),
    operations: exhibitor ? [] : event.operations,
    signage: exhibitor ? [] : event.signage,
    analytics: exhibitor ? { searches: 0, routes: 0, dwellSeconds: 0 } : event.analytics,
    ...(user.role === 'admin' ? { users: state.users.map(publicUser) } : {}),
    paymentConfigured: false,
  };
}
function boothStatus(event: StoredEvent, booth: VenueBooth): NonNullable<VenueBooth['status']> {
  return event.bookings.some((item) => item.boothId === booth.id && item.status === 'confirmed')
    ? 'booked'
    : event.holds.some(
          (item) =>
            item.boothId === booth.id &&
            item.status === 'active' &&
            Date.parse(item.expiresAt) > Date.now(),
        )
      ? 'held'
      : booth.available
        ? 'available'
        : 'unavailable';
}
function audit(event: StoredEvent, user: VenueUser, action: string, subjectId?: string): void {
  event.audit.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId: user.id,
    action,
    subjectId,
  });
}
function publish(
  event: StoredEvent,
  layout: BuildingLayout,
  user: VenueUser,
  expectedVersion: number,
  restoredFrom?: string,
): void {
  if (event.version !== expectedVersion) {
    fail(409, 'The published version changed. Refresh before publishing.');
  }
  const errors = publishReadiness(layout);
  if (errors.length) {
    fail(
      422,
      `Layout is not ready: ${errors.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('; ')}`,
    );
  }
  layout = { ...layout, buildingId: event.id };
  for (const booking of event.bookings) {
    if (
      booking.status === 'confirmed' &&
      !layout.rooms.some((room) => room.id === booking.boothId && room.type === 'booth')
    ) {
      fail(409, 'Publication would remove a booked booth. Cancel its booking first.');
    }
  }
  const normalized = normalizeLayout(layout);
  if (normalized.isOk()) {
    const knownDestinations = new Set(
      getNavigationDestinations(normalized.value).map((destination) => destination.id),
    );
    const danglingSignage = event.signage.filter(
      (item) => item.destinationId && !knownDestinations.has(item.destinationId),
    );
    if (danglingSignage.length) {
      fail(
        409,
        `Publication would orphan signage links: ${danglingSignage.map((item) => item.id).join(', ')}. Update or remove them first.`,
      );
    }
  }
  const now = new Date().toISOString();
  const old = new Map(event.booths.map((booth) => [booth.id, booth]));
  event.booths = layout.rooms
    .filter((room) => room.type === 'booth')
    .map((room) => ({
      id: room.id,
      priceCents: Math.round((room.price ?? 0) * 100),
      currency: 'USD',
      available: true,
      claimUserIds: [],
      ...old.get(room.id),
      floorId: room.floorId,
      label: room.label ?? room.id,
    }));
  for (const hold of event.holds) {
    if (hold.status === 'active' && !event.booths.some((booth) => booth.id === hold.boothId)) {
      hold.status = 'released';
    }
  }
  event.layout = layout;
  event.version += 1;
  const version = {
    id: randomUUID(),
    number: event.version,
    createdAt: now,
    userId: user.id,
    restoredFrom,
    layout,
  };
  event.versions.push(version);
  audit(event, user, restoredFrom ? 'rollback' : 'publish', version.id);
}
export async function eventList(token: string | undefined): Promise<VenueEvent[]> {
  const state = await read();
  const user = authenticate(state, token);
  return state.events
    .filter((event) => user.role === 'admin' || user.eventIds.includes(event.id))
    .map(({ id, name, createdAt, version }) => ({ id, name, createdAt, version }));
}
export async function getSnapshot(
  token: string | undefined,
  eventId: string,
): Promise<VenueSnapshot> {
  return transaction((state) => {
    const user = authenticate(state, token);
    scope(user, eventId);
    return snapshot(state, eventFor(state, eventId), user);
  });
}
export async function publicLayoutSnapshot(eventId: string): Promise<{
  layout: BuildingLayout | null;
  version: number;
  managed: boolean;
}> {
  const event = (await read()).events.find((item) => item.id === eventId);
  return {
    layout: event?.layout ?? null,
    version: event?.version ?? 0,
    managed: Boolean(event),
  };
}
export async function publicVersion(eventId: string): Promise<number> {
  return (await publicLayoutSnapshot(eventId)).version;
}
export async function privateDraft(
  token: string | undefined,
  eventId: string,
): Promise<BuildingLayout | null> {
  const state = await read();
  const user = authenticate(state, token);
  scope(user, eventId);
  role(user, ['admin', 'organizer']);
  return state.events.find((event) => event.id === eventId)?.draft ?? null;
}
export async function writeLayout(
  token: string | undefined,
  eventId: string,
  layout: BuildingLayout,
  draft: boolean,
  expectedVersion?: number,
): Promise<void> {
  await transaction((state) => {
    const user = authenticate(state, token);
    scope(user, eventId);
    role(user, ['admin', 'organizer']);
    let event = state.events.find((item) => item.id === eventId);
    if (!event) {
      event = newEvent(eventId, eventId);
      state.events.push(event);
    }
    if (draft) {
      event.draft = layout;
      audit(event, user, 'save-draft');
    } else {
      publish(event, layout, user, expectedVersion ?? event.version);
    }
  });
}
export async function publicSignage(
  eventId: string,
): Promise<{ version: number; signage: VenueSignage[] }> {
  const event = (await read()).events.find((item) => item.id === eventId);
  if (!event?.layout) {
    fail(404, 'Published event not found.');
  }
  return { version: event.version, signage: event.signage };
}
export async function publicView(eventId: string): Promise<VenuePublicView> {
  const event = (await read()).events.find((item) => item.id === eventId);
  if (!event?.layout) {
    fail(404, 'Published event not found.');
  }
  return {
    eventId,
    version: event.version,
    booths: event.booths.map((booth) => ({
      id: booth.id,
      floorId: booth.floorId,
      label: booth.label,
      priceCents: booth.priceCents,
      currency: booth.currency,
      branding: booth.branding,
      status: event.bookings.some(
        (item) => item.boothId === booth.id && item.status === 'confirmed',
      )
        ? 'booked'
        : event.holds.some(
              (item) =>
                item.boothId === booth.id &&
                item.status === 'active' &&
                Date.parse(item.expiresAt) > Date.now(),
            )
          ? 'held'
          : booth.available
            ? 'available'
            : 'unavailable',
    })),
    operations: event.operations
      .filter((item) => !item.resolvedAt)
      .map(({ id, kind, floorId, position, count, createdAt }) => ({
        id,
        kind,
        floorId,
        position,
        count,
        createdAt,
      })),
    signage: event.signage,
  };
}
export async function telemetry(
  eventId: string,
  items: { kind: 'search' | 'route' | 'dwell'; durationSeconds?: number }[],
): Promise<{ recorded: boolean }> {
  return transaction((state) => {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) {
      return { recorded: false };
    }
    for (const item of items) {
      if (item.kind === 'search') {
        event.analytics.searches++;
      } else if (item.kind === 'route') {
        event.analytics.routes++;
      } else {
        event.analytics.dwellSeconds += item.durationSeconds ?? 0;
      }
    }
    return { recorded: true };
  });
}

export async function command(
  token: string | undefined,
  eventId: string,
  action: VenueCommand,
): Promise<VenueSnapshot> {
  return transaction((state) => {
    const user = authenticate(state, token);
    if (action.type === 'create-user') {
      role(user, ['admin']);
      if (state.users.some((item) => item.name.toLowerCase() === action.name.toLowerCase())) {
        fail(409, 'User name already exists.');
      }
      if (action.eventIds.some((id) => !state.events.some((event) => event.id === id))) {
        fail(422, 'Assign only existing events.');
      }
      const added: StoredUser = {
        id: randomUUID(),
        name: action.name,
        role: action.role,
        eventIds: action.eventIds,
        passwordHash: passwordHash(action.password),
      };
      state.users.push(added);
      const event = eventFor(state, eventId);
      audit(event, user, 'create-user', added.id);
      return snapshot(state, event, user);
    }
    if (action.type === 'update-user') {
      role(user, ['admin']);
      const target = state.users.find((item) => item.id === action.userId);
      if (!target) {
        fail(404, 'User not found.');
      }
      if (target.id === user.id && action.role !== 'admin') {
        fail(409, 'Do not remove your own administrator access.');
      }
      if (action.eventIds.some((id) => !state.events.some((event) => event.id === id))) {
        fail(422, 'Assign only existing events.');
      }
      target.role = action.role;
      target.eventIds = action.eventIds;
      if (action.password) {
        target.passwordHash = passwordHash(action.password);
      }
      state.sessions = state.sessions.filter((item) => item.userId !== target.id);
      const event = eventFor(state, eventId);
      audit(event, user, 'update-user', target.id);
      return snapshot(state, event, user);
    }
    if (action.type === 'create-event') {
      role(user, ['admin', 'organizer']);
      let layout = action.layout;
      if (action.templateEventId) {
        scope(user, action.templateEventId);
        layout = eventFor(state, action.templateEventId).layout;
        if (!layout) {
          fail(422, 'Template has no published layout.');
        }
      }
      const event = newEvent(randomUUID(), action.name);
      state.events.push(event);
      if (user.role !== 'admin') {
        user.eventIds.push(event.id);
      }
      if (layout) {
        event.draft = { ...layout, buildingId: event.id };
      } else {
        // A fresh event opens on a calibrated blank metric floor so the
        // organizer lands in the studio instead of a "no saved draft" error.
        event.draft = {
          buildingId: event.id,
          floors: [blankFloor(`floor-${randomUUID()}`, 'Floor 1', 0)],
          rooms: [],
          portals: [],
        };
      }
      audit(event, user, 'create-event');
      return snapshot(state, event, user);
    }
    scope(user, eventId);
    const event = eventFor(state, eventId);
    const booth =
      'boothId' in action ? event.booths.find((item) => item.id === action.boothId) : undefined;
    if ('boothId' in action && !booth) {
      fail(404, 'Booth does not exist in this published event.');
    }
    const now = new Date().toISOString();
    switch (action.type) {
      case 'claim':
        role(user, ['admin', 'organizer', 'exhibitor']);
        if (booth!.ownerId && booth!.ownerId !== user.id) {
          fail(409, 'Booth already claimed.');
        }
        if (!booth!.claimUserIds.includes(user.id)) {
          booth!.claimUserIds.push(user.id);
        }
        break;
      case 'approve-claim':
        role(user, ['admin', 'organizer']);
        if (!booth!.claimUserIds.includes(action.userId)) {
          fail(422, 'No pending claim for this user.');
        }
        if (action.approved) {
          if (booth!.ownerId && booth!.ownerId !== action.userId) {
            fail(409, 'Booth is already owned.');
          }
          booth!.ownerId = action.userId;
        }
        booth!.claimUserIds = booth!.claimUserIds.filter((id) => id !== action.userId);
        break;
      case 'branding':
        role(user, ['admin', 'organizer', 'exhibitor']);
        if (user.role === 'exhibitor' && booth!.ownerId !== user.id) {
          fail(403, 'Your booth claim must be approved before changing its branding.');
        }
        booth!.branding = {
          displayName: action.displayName,
          logoUrl: action.logoUrl,
          color: action.color,
        };
        break;
      case 'availability':
        role(user, ['admin', 'organizer']);
        booth!.priceCents = action.priceCents;
        booth!.currency = action.currency;
        booth!.available = action.available;
        break;
      case 'hold': {
        role(user, ['admin', 'organizer', 'exhibitor']);
        if (
          !booth!.available ||
          event.bookings.some(
            (booking) => booking.boothId === booth!.id && booking.status === 'confirmed',
          )
        ) {
          fail(409, 'Booth is unavailable or booked.');
        }
        const active = event.holds.find(
          (hold) => hold.boothId === booth!.id && hold.status === 'active',
        );
        if (active) {
          if (active.userId !== user.id) {
            fail(409, 'Another visitor holds this booth.');
          }
          return snapshot(state, event, user);
        }
        event.holds.push({
          id: randomUUID(),
          boothId: booth!.id,
          userId: user.id,
          status: 'active',
          priceCents: booth!.priceCents,
          currency: booth!.currency,
          expiresAt: new Date(Date.now() + action.minutes * 60000).toISOString(),
        });
        break;
      }
      case 'release-hold': {
        const hold = event.holds.find((item) => item.id === action.holdId);
        if (!hold) {
          fail(404, 'Hold not found.');
        }
        if (hold.userId !== user.id) {
          role(user, ['admin', 'organizer']);
        }
        if (hold.status === 'active') {
          hold.status = 'released';
        }
        break;
      }
      case 'book': {
        role(user, ['admin', 'organizer', 'exhibitor']);
        const hold = event.holds.find((item) => item.id === action.holdId);
        if (!hold || hold.userId !== user.id) {
          fail(404, 'Your hold was not found.');
        }
        if (hold.status === 'converted') {
          return snapshot(state, event, user);
        }
        if (hold.status !== 'active' || Date.parse(hold.expiresAt) <= Date.now()) {
          fail(409, 'Hold expired or released.');
        }
        const heldBooth = event.booths.find((item) => item.id === hold.boothId);
        if (
          !heldBooth?.available ||
          event.bookings.some(
            (item) => item.boothId === hold.boothId && item.status === 'confirmed',
          )
        ) {
          fail(409, 'Booth is no longer available.');
        }
        const bookingId = randomUUID(),
          invoiceId = randomUUID();
        hold.status = 'converted';
        event.bookings.push({
          id: bookingId,
          boothId: hold.boothId,
          userId: user.id,
          invoiceId,
          createdAt: now,
          status: 'confirmed',
        });
        event.invoices.push({
          id: invoiceId,
          bookingId,
          userId: user.id,
          amountCents: hold.priceCents ?? heldBooth.priceCents,
          currency: hold.currency ?? heldBooth.currency,
          status: 'unpaid',
          paymentProvider: 'unconfigured',
          createdAt: now,
        });
        break;
      }
      case 'cancel-booking': {
        const booking = event.bookings.find((item) => item.id === action.bookingId);
        if (!booking) {
          fail(404, 'Booking not found.');
        }
        if (booking.userId !== user.id) {
          role(user, ['admin', 'organizer']);
        }
        const invoice = event.invoices.find((item) => item.id === booking.invoiceId);
        if (invoice?.status === 'paid') {
          fail(409, 'Paid bookings require a configured refund workflow.');
        }
        booking.status = 'cancelled';
        if (invoice) {
          invoice.status = 'void';
        }
        break;
      }
      case 'payment-checkout': {
        const invoice = event.invoices.find((item) => item.id === action.invoiceId);
        if (!invoice) {
          fail(404, 'Invoice not found.');
        }
        if (invoice.userId !== user.id) {
          role(user, ['admin', 'organizer']);
        }
        fail(503, 'Payment provider is not configured. No payment was collected or marked paid.');
      }
      case 'publish':
        role(user, ['admin', 'organizer']);
        publish(event, action.layout, user, action.expectedVersion);
        return snapshot(state, event, user);
      case 'rollback': {
        role(user, ['admin', 'organizer']);
        const version = event.versions.find((item) => item.id === action.versionId);
        if (!version) {
          fail(404, 'Version not found.');
        }
        publish(event, version.layout, user, action.expectedVersion, version.id);
        return snapshot(state, event, user);
      }
      case 'operation':
        role(user, ['admin', 'organizer', 'ops']);
        if (!event.layout?.floors.some((floor) => floor.id === action.floorId)) {
          fail(422, 'Operation requires a floor in the published layout.');
        }
        if (action.kind === 'occupancy' && action.count === undefined) {
          fail(422, 'An observed occupancy count is required.');
        }
        {
          const normalized = normalizeLayout(event.layout);
          const boundary = normalized.isOk()
            ? normalized.value.floors.find((floor) => floor.id === action.floorId)?.authoring
                ?.boundary
            : undefined;
          if (boundary && !pointInPolygon(action.position, boundary)) {
            fail(422, 'Operation position is outside the authored floor boundary.');
          }
        }
        event.operations.push({
          id: randomUUID(),
          kind: action.kind,
          floorId: action.floorId,
          position: action.position,
          note: action.note,
          count: action.count,
          createdAt: now,
        });
        break;
      case 'resolve-operation': {
        role(user, ['admin', 'organizer', 'ops']);
        const operation = event.operations.find((item) => item.id === action.operationId);
        if (!operation) {
          fail(404, 'Operation not found.');
        }
        operation.resolvedAt = now;
        break;
      }
      case 'signage': {
        role(user, ['admin', 'organizer', 'ops']);
        if (action.destinationId) {
          const normalized = normalizeLayout(event.layout);
          if (
            normalized.isErr() ||
            !getNavigationDestinations(normalized.value).some(
              (item) => item.id === action.destinationId,
            )
          ) {
            fail(422, 'Signage destination is not in the published layout.');
          }
        }
        const item: VenueSignage = {
          id: action.signageId,
          title: action.title,
          body: action.body,
          destinationId: action.destinationId,
          updatedAt: now,
        };
        const index = event.signage.findIndex((sign) => sign.id === item.id);
        if (index >= 0) {
          event.signage[index] = item;
        } else {
          event.signage.push(item);
        }
        break;
      }
      case 'analytics':
        if (action.kind === 'search') {
          event.analytics.searches += 1;
        } else if (action.kind === 'route') {
          event.analytics.routes += 1;
        } else {
          event.analytics.dwellSeconds += action.durationSeconds ?? 0;
        }
        return snapshot(state, event, user);
    }
    audit(event, user, action.type, 'boothId' in action ? action.boothId : undefined);
    return snapshot(state, event, user);
  });
}
