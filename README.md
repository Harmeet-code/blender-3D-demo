# blender-3D-demo

## Run the app

```powershell
bun install
bun start
```

One launcher starts the frontend on http://127.0.0.1:5175/ and backend on
http://127.0.0.1:8000/, with hot reload in development.

```powershell
bun start --production
```

Production builds both services, then serves the compiled frontend at
http://127.0.0.1:5175/floorplan/ and the compiled backend on port 8000,
without watchers or Vite's preview server. Set `NODE_ENV=production` to select
the same mode without the flag. `bun run build` builds both without starting them.

Keep the terminal open; Ctrl+C stops the services this launcher started.
Stop development before starting production: production refuses occupied ports
rather than reusing development services. Database and Redis connections remain
optional and use the existing environment configuration; the launcher does not
start Docker or run migrations. These servers bind to loopback; deploy behind
your HTTPS reverse proxy for external access. Preserve local data directories.

## Frontend structure

The browser app is rooted at `src/`:

- `src/app/` contains the entrypoint, app composition, providers, and runtime
  configuration.
- `src/features/` owns domain code: building/layout, booths, orders, assets,
  presence, navigation, viewer state, and the 3D world.
- `src/pages/` composes feature screens; `src/components/ui/` contains shared
  visual primitives and `src/components/layout/` contains the application
  shell.
- `src/api/`, `src/hooks/`, `src/lib/`, `src/utils/`, and `src/types/` hold
  cross-feature infrastructure and generic helpers.
- `src/assets/` contains active catalog and physical metadata imported through
  Vite. Built-in objects use native R3F recipes; saved layouts and uploaded models
  retain their separate public/media compatibility paths.

HTTP requests use the shared Axios boundary in `src/api/`, feature API clients,
and TanStack Query hooks for server state. API clients validate response data
before exposing it. Neverthrow Results are unwrapped at the TanStack Query
boundary so failed requests enter Query's error state; WebSocket presence
remains realtime state rather than cached query data.

The app currently switches between the world and admin views inside the app
shell; it does not use a URL router. Add one only when URL-addressable screens
are a product requirement.

## Backend structure

The Fastify backend is isolated under `src/server/`:

- `app/` owns application composition, the process entrypoint, Fastify plugins,
  and graceful shutdown.
- `modules/` groups health, layouts, booths, orders, and presence by domain;
  routes, services, and repositories stay with their owning module.
- `shared/` contains cross-module configuration, logging, and Result/error
  helpers.
- `infrastructure/database/` owns the Drizzle/Postgres adapter, schema,
  migrations, and seed/migration commands; `infrastructure/cache/` owns Redis.

`app/create-app.ts` composes the Fastify instance without listening, while
`app/server.ts` starts it and installs process shutdown handlers. This keeps
application setup independently testable and the runtime lifecycle explicit.

## Calibrated floor plans and refined booths

The default Luminary venue supports floor-image uploads, physical calibration,
manual placement of eight refined booth sizes and imported Blender GLBs, saved
layouts, and obstacle-aware avatar navigation between floors. The live viewer
uses the warm sun, cool sky, and soft shadows of the Blender reference.
See [the authoring guide](docs/venue-authoring.md) for dimensions, asset locations,
calibration limits, storage, and reproduction commands.

The original mall at `/view/default-event#/mall` now builds native R3F geometry
from a versioned, compressed scene blueprint. It does not load a GLB or Draco
decoder. All 11,259 original geometry objects retain their source identities;
custom surfaces, vehicles and lettering retain evaluated Blender topology.
See [the mall implementation and evidence](docs/mall-procedural-execution.md).

Reusable `SUV`, `Chair`, `Escalator` and other named R3F components are under
`src/features/mall/objects/`. The mall's **Reusable objects** button opens their
standalone gallery. See [the component guide](docs/reusable-r3f-objects.md) for
all 66 entries, physical props and import examples.

## Legacy archive

Confirmed legacy exports, metadata, previews and superseded plans were moved to
`archive/legacy-2026-10-14/`. See [the cleanup guide](docs/legacy-archive.md) for
the manifest, preserved dependencies, integrity evidence and safe restoration.
