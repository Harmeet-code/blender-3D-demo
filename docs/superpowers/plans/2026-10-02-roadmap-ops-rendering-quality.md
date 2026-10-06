# Roadmap Operations, Rendering, and Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable CI, reduce initial JavaScript chunk size, improve baked ambient occlusion, add an explicit WebGPU/WebGL2 renderer fallback, and automate browser coverage.

**Architecture:** Keep CI deterministic on the existing Bun toolchain. Split only measured vendor groups. Preserve editable Blender sources and existing GLB fallback while baking AO. Select WebGPU only after feature detection and successful initialization; otherwise instantiate WebGL2. Auth and CDN provisioning remain deferred by user direction.

**Tech Stack:** GitHub Actions, Bun, Vite/Rollup, Blender/glTF Transform, Three.js `WebGPURenderer`, React Three Fiber, Playwright.

---

### Task 1: Add GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Define push and pull-request triggers**

Use checkout, a pinned Bun setup action, `bun install --frozen-lockfile`, `bun run verify`, `bun run assets:validate`, and `bun run build` on Windows-independent Ubuntu runners.

- [ ] **Step 2: Run the exact workflow commands locally**

Run: `bun install --frozen-lockfile && bun run verify && bun run assets:validate && bun run build`.

- [ ] **Step 3: Commit and inspect workflow syntax**

Use GitHub Actions YAML validation or `actionlint` if available; commit only the workflow after all local commands pass.

### Task 2: Split the production entry bundle

**Files:**
- Modify: `vite.config.ts`
- Create: `tests/build-chunks.test.ts` or `scripts/assets/check-build-chunks.ts`

- [ ] **Step 1: Capture current build chunk sizes**

Run: `bun run build`; record emitted entry/vendor sizes from Vite output as the baseline.

- [ ] **Step 2: Add a failing budget assertion**

Assert the app entry chunk is below 500 kB and required Three/R3F/UI chunks exist without duplicate Three versions.

- [ ] **Step 3: Add measured manual chunks**

Group `three` and `@react-three/*` into a rendering chunk; keep React and UI dependencies separate only where the graph has no circular dependency. Use `build.rollupOptions.output.manualChunks`.

- [ ] **Step 4: Verify production behavior**

Run: `bun run build`; use `bun run preview` and browser-test base path `/floorplan/`, 3D rendering, lazy panel imports, and console errors. Remove chunk groups that create circular dependency warnings.

### Task 3: Bake ambient occlusion into supported assets

**Files:**
- Modify: `assets-source/blender/build.py` and relevant per-asset builders
- Modify: `scripts/assets/validate.ts`
- Modify: `src/frontend/assets/metadata/catalog.v1.json` only when export versions change
- Test: `tests/asset-pipeline.test.ts`, `tests/asset-contracts.test.ts`

- [ ] **Step 1: Add UV2/occlusion contract tests**

Validate AO texture/channel presence, UV2 coordinates, and matching metadata release version; maintain fixtures where AO is intentionally absent.

- [ ] **Step 2: Bake and export one representative asset**

Bake AO in Blender for floor/wall/booth assets, export a test GLB, and verify the `TEXCOORD_1`/occlusion texture is present.

- [ ] **Step 3: Extend release validation and catalog versions**

Reject a declared baked-AO release missing UV2 or its occlusion map; keep unbaked source/export as rollback and preserve triangle/material budgets.

- [ ] **Step 4: Browser-check with dynamic shadows disabled**

Compare reference lighting at standard and low quality; verify no dark seams, doubled shadowing, or missing material channels.

- [ ] **Step 5: Verify and commit asset changes**

Run: `bun test tests/asset-pipeline.test.ts tests/asset-contracts.test.ts && bun run assets:validate && bun run build`.

### Task 4: Add WebGPU renderer with WebGL2 fallback

**Files:**
- Modify: `src/frontend/widgets/world-viewport/WorldCanvas.tsx`
- Create: `src/frontend/widgets/world-viewport/create-renderer.ts`
- Test: new `tests/renderer-selection.test.ts`

- [ ] **Step 1: Test feature selection and initialization failure**

Mock `navigator.gpu`/renderer factories; assert unavailable WebGPU and rejected async init each choose WebGL2, and successful init chooses WebGPU.

- [ ] **Step 2: Implement one renderer factory**

Use Three’s async `WebGPURenderer.init()` via R3F’s async `gl` factory; feature-detect first and catch initialization errors to construct `WebGLRenderer` with WebGL2. Keep renderer creation idempotent per canvas.

- [ ] **Step 3: Add accessible initialization fallback**

If neither backend can create a context, render an in-DOM shadcn `Alert` with a recovery action instead of a blank canvas.

- [ ] **Step 4: Verify both backends**

Run: `bun test tests/renderer-selection.test.ts && bun run typecheck && bun run build`; test WebGPU-capable browser and forced-WebGL2 configuration; verify Rapier, shadows, picking, and diagnostics on both.

### Task 5: Add navigation and reservation E2E tests

**Files:**
- Create: `tests/e2e/world-navigation.spec.ts`
- Create: `tests/e2e/reservation.spec.ts`
- Modify: `package.json` and `bun.lock` only for a pinned Playwright test dependency and scripts
- Create: `playwright.config.ts`

- [ ] **Step 1: Add deterministic E2E setup**

Configure a fixed base URL, start frontend/server processes, seed an isolated test event, and clean up the event after each test.

- [ ] **Step 2: Test world navigation**

Cover floor selection, command-palette room search, teleport/autopilot, double-click path, canceled route, and no-route handling.

- [ ] **Step 3: Test reservation success and failure**

Assert the selected add-ons reach the real endpoint, success displays the order ID, server conflict preserves selections, and retry can succeed.

- [ ] **Step 4: Run E2E and all gates**

Run: `bun run test:e2e && bun run verify && bun run build`; record browser version and screenshots as artifacts only if configured by CI.

## Explicit deferrals

- Do not implement admin auth until the user selects an identity provider.
- Do not move assets to CDN or mark that TODO complete until a storage/CDN destination is selected.
- Do not claim the integrated-GPU acceptance task complete from this desktop host.
