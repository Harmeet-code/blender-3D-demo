# Result and HTTP data-flow review

This note describes where this repository uses `neverthrow`, where exceptions
are appropriate, and how typed API results interact with TanStack Query.

## Design principle

Use `Result<T, E>` for expected, recoverable failures in domain logic and
validation. Keep exception-producing library calls at explicit IO boundaries,
and convert their failures to the application's typed error model there.

This is not a rule that all code must be `try/catch`-free or that every
unexpected programming error should be disguised as an ordinary domain error.
A `Promise<Result<T, E>>` can still reject if an implementation throws before
it creates the `Result`, or if code outside its documented boundary fails.
Treat the return type as a contract to uphold and test, not as a JavaScript
runtime guarantee.

## Frontend request flow

The HTTP path is:

```text
Axios request
  → src/api/api-result.ts
  → Result<unknown, ApiError>
  → Zod response validation
  → Result<T, ApiError>
  → TanStack Query adapter
  → query data or query error state
```

`src/api/api-result.ts` normalizes transport and response-parsing failures into
`ApiError`. Endpoint clients pass response bodies to Zod schemas and expose
typed values only after successful validation. Raw JSON starts as `unknown`;
do not add an unchecked `as T` cast at this boundary.

TanStack Query has a different contract from neverthrow: its `queryFn` must
resolve to data or reject. Returning `Err` directly would make the `Err` object
look like successful cached data. The small `unwrapQueryResult` adapter throws
the typed error only at that library boundary:

```ts
queryFn: async ({ signal }) =>
  unwrapQueryResult(await getLayout(eventId, { signal }))
```

The resulting Query error is an `ApiError` value, not necessarily an
`instanceof Error`. UI code should read its typed `message` field or narrow
unknown errors, rather than assuming Error identity. Queries and mutations
should continue to use feature-owned hooks and stable query keys; mutations
that change cached server data should invalidate the corresponding keys.
Realtime WebSocket presence is event-driven and remains outside query caching.

Relevant implementation:

- `src/api/client.ts` — shared Axios configuration
- `src/api/api-result.ts` — Axios and Zod-to-Result boundary
- `src/api/query-result.ts` — Result-to-TanStack Query adapter
- `src/features/building/hooks/use-layout-query.ts` — layout query and key
- `src/features/booths/hooks/use-reserve-booth.ts` — reservation mutation

## Server request flow

Repositories and other throwing persistence calls are wrapped at the service
boundary. For example, `fromRepository` catches a repository rejection and
converts it into an `INTERNAL` `AppError`. Services then return Results, and
routes translate those Results to HTTP responses.

```ts
const loaded = await fromRepository(
  () => repository.listForEvent(eventId),
  `List booths for ${eventId}`,
);
if (loaded.isErr()) {
  return err(loaded.error);
}
```

Catch only where there is an intentional translation or recovery policy.
Cleanup/shutdown code may also catch disposal failures so it can attempt the
remaining cleanups and report the failures. Do not add empty catches or turn
unexpected exceptions into success-shaped fallback data.

## Choosing Result, rejection, or a catch

| Situation | Preferred handling |
| --- | --- |
| Expected invalid input or domain conflict | Return `err(...)` with a typed error |
| Zod input/output validation | Use `safeParse` and map issues to a Result |
| Throwing persistence/transport operation | Convert failure at its IO boundary |
| TanStack Query function receives a Result | Unwrap at the Query boundary so Query records an error |
| UI event callback receives a rejected mutation | Catch and present/report the failure |
| Disposal must continue after one cleanup fails | Catch that cleanup, record/log it, then continue |
| Invalid trusted developer fixture | Assert it in tests; do not silently substitute an empty fixture |
| Unexpected programming error | Preserve useful diagnostics; do not mislabel it as validation or success |

`ResultAsync.fromPromise` is useful for converting a Promise rejection, but it
cannot catch a synchronous throw that occurs while evaluating the Promise
argument. When that call can throw synchronously, defer invocation inside a
Promise callback or use a narrow `try/catch` at the adapter.

## Fixture initialization

The built-in layouts are authored fixtures, not untrusted API payloads.
`normalizeLayout` correctly returns a Result, but a module-level
`if (result.isErr()) throw ...` makes importing a fixture fail fast if the
fixture is broken. That may be an intentional developer-facing invariant; it
is not equivalent to swallowing the error or returning an empty layout.

Keep these fixtures covered by tests that normalize and validate them. If a
future fixture becomes user-provided or optional runtime data, expose its
failure as a Result and let the caller choose a visible recovery state. Avoid
fabricating a fallback `NormalizedLayout` merely to avoid a throw.

## Review checklist

- Do API response values remain `unknown` until a schema validates them?
- Are expected failures represented by a useful, typed error?
- Does each boundary preserve status, cause, and enough diagnostics to debug?
- Do Query functions reject on Result errors rather than cache `Err` values?
- Are catches tied to an explicit translation, recovery, or cleanup policy?
- Are static fixtures validated in tests without silent fallback values?
- Do tests cover success, validation, HTTP, network, malformed JSON, and
  concurrent/deduplicated query behavior?
