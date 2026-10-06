# Roadmap Foundation and Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static-only layout startup with validated API data, wire booth reservation to the existing service, add reservation rate limits, and verify local infrastructure/CI.

**Architecture:** Keep the demo layout as a resilient initial/last-valid snapshot. Load through the existing `getLayout` entity client and update the Zustand store only after validated normalization succeeds. The reserve UI calls the existing entity client; the server transaction remains authoritative and creates the existing pending order. Add an invoice only after business pricing exists.

**Tech Stack:** React, Zustand, `neverthrow`, Zod, Fastify, Postgres, Redis, Bun, GitHub Actions.

---

### Task 1: Load the selected event layout through the API

**Files:**
- Modify: `src/frontend/entities/building/model/layout-store.ts`
- Modify: `src/frontend/app/App.tsx`
- Test: `tests/frontend-results.test.ts`

- [ ] **Step 1: Add API-load behavior tests**

Test the store with a mocked `fetch`: a valid `layoutResponseSchema` response replaces `demoLayout`; a network/HTTP/parse failure retains the previous valid layout and exposes an error status.

```ts
expect(useLayoutStore.getState().layout.rooms).toEqual(previous.rooms);
expect(useLayoutStore.getState().loadStatus).toBe('error');
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `bun test tests/frontend-results.test.ts`
Expected: the load-state/action assertions fail because the store does not yet load an event.

- [ ] **Step 3: Add an async store action using the validated client**

Add `load(eventId)` to the store. It calls `getLayout(eventId)`, sets `loading`, calls the existing `update()` only on `Ok`, and on either API or normalization error keeps the last valid layout. Add `loadStatus: 'idle' | 'loading' | 'ready' | 'error'` and `loadError: string | null`.

```ts
const result = await getLayout(eventId);
if (result.isErr()) return set({ loadStatus: 'error', loadError: result.error.message });
const updated = get().update(result.value);
```

- [ ] **Step 4: Trigger loading once for the configured event**

In `App.tsx`, use an effect to call `load(import.meta.env.VITE_EVENT_ID ?? 'convention-center-01')`; render a shadcn `Alert` for the recoverable error while retaining the current layout. Add the `VITE_EVENT_ID` type/config only if TypeScript requires it.

- [ ] **Step 5: Verify and commit**

Run: `bun test tests/frontend-results.test.ts && bun run typecheck`
Expected: tests pass and the TypeScript check exits 0. Commit only layout-store, App/config, and the focused test.

### Task 2: Wire the booth customizer to reservation

**Files:**
- Modify: `src/frontend/features/booth-customize/BoothDrawer.tsx`
- Modify if required: `src/frontend/entities/booth/api/booths-client.ts`
- Test: `tests/frontend-results.test.ts`

- [ ] **Step 1: Test request payload and failure preservation**

Mock the validated client/fetch and assert the selected booth and add-on IDs are sent unchanged; an HTTP error leaves cart state intact and exposes a visible error.

```ts
expect(JSON.parse(String(requestInit?.body))).toEqual({
  boothId: 'room-101',
  addOns: ['chair', 'logo-banner'],
});
```

- [ ] **Step 2: Run the test and confirm the reservation call is absent**

Run: `bun test tests/frontend-results.test.ts`
Expected: the new reservation assertion fails before the UI handler is added.

- [ ] **Step 3: Add pending/success/error UI state**

Call `reserveBooth(eventId, { boothId, addOns })` from the enabled button. Disable duplicate submission while pending; announce success with the returned `orderId`; show the API error in an `Alert`; preserve cart selections on failure. Keep the invoice language explicitly deferred.

- [ ] **Step 4: Verify test and app checks**

Run: `bun test tests/frontend-results.test.ts && bun run typecheck && bun run lint`
Expected: focused tests pass; lint may emit only existing warnings.

### Task 3: Complete and limit the pending-order reservation transaction

**Files:**
- Modify: `src/server/features/booths/routes.ts`
- Modify: `src/server/features/booths/service.ts`
- Modify: `src/server/features/booths/repository.ts`
- Create: `src/server/shared/plugins/rate-limit.ts`
- Test: `tests/server-features.test.ts`, `tests/server-results.test.ts`

- [ ] **Step 1: Add transaction and rate-limit tests**

Test that successful reservation atomically changes `available` to `reserved` and inserts one pending order; duplicate reservation returns `CONFLICT`; rate limit returns HTTP 429 with a validated error envelope.

- [ ] **Step 2: Run focused backend tests and confirm failures**

Run: `bun test tests/server-features.test.ts tests/server-results.test.ts`
Expected: the new route/rate-limit cases fail before implementation.

- [ ] **Step 3: Add a Redis fixed-window limit with a dev fallback**

Use a key scoped by event and client address. With Redis configured, increment and set expiry atomically; without Redis, use a bounded in-process fixed-window map for local development. Include `Retry-After`, avoid logging raw credentials, and keep rate-limit failures typed.

- [ ] **Step 4: Keep reservation/order writes transactional**

Retain the existing `sql.begin` transaction, ensure the update predicate only reserves `available` booths, insert a pending order only when an update row was returned, and surface duplicate requests as `CONFLICT`.

- [ ] **Step 5: Verify and commit**

Run: `bun test tests/server-features.test.ts tests/server-results.test.ts && bun run typecheck`
Expected: all focused server tests pass. Do not add invoice totals or currency; pricing is deferred.

### Task 4: Boot live Postgres/Redis and verify migrations/seed

**Files:**
- Modify only if tests expose defects: `docker-compose.yml`, `src/server/db/migrate.ts`, `src/server/db/seed.ts`
- Test: `tests/infra-health.test.ts`

- [ ] **Step 1: Check Docker daemon availability**

Run: `docker info`. If unavailable, start Docker Desktop only if installed and retry; do not alter/delete existing named volumes.

- [ ] **Step 2: Boot dependencies and inspect health**

Run: `bun run infra:up` then `docker compose ps`. Expected: postgres and redis are healthy.

- [ ] **Step 3: Run migrations and seed twice**

Run: `bun run db:migrate && bun run db:seed && bun run db:migrate && bun run db:seed`.
Expected: migration is idempotent; seeded event/layout remains valid; `/api/health` reports both dependencies `up`.

- [ ] **Step 4: Record real result**

If Docker remains unavailable, leave the TODO unchecked and record the exact daemon error. Do not count the mocked health tests as live infra acceptance.

### Task 5: Add GitHub Actions verification

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a workflow that runs on push and pull request**

Use checkout, Bun setup pinned to the project’s Bun 1.4.2, frozen install, then `bun run verify`, `bun run assets:validate`, and `bun run build`.

- [ ] **Step 2: Validate workflow structure**

Run local equivalents: `bun install --frozen-lockfile && bun run verify && bun run assets:validate && bun run build`.
Expected: every command exits 0 (existing lint warnings are non-fatal).

- [ ] **Step 3: Commit workflow**

Commit only `.github/workflows/ci.yml` after local checks pass.
