# Roadmap Acceptance and TODO Reconciliation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the archived asset change and every actionable roadmap checkbox against fresh verification evidence without deleting ambiguous assets or claiming unavailable gates passed.

**Architecture:** Keep TODO statements atomic: split completed archival/order/reservation work from deferred invoice, provider, Docker, and hardware work. Link reports to each completed gate and preserve the two uncheckboxed cleanup notes verbatim.

**Tech Stack:** TODO.md, OpenSpec CLI, Bun checks, browser reports, Git.

---

### Task 1: Reconcile completed archive and split partial tasks

**Files:**
- Modify: `TODO.md`
- Verify: `openspec/changes/archive/2026-10-02-blender-asset-pipeline/`
- Verify: `openspec/specs/asset-placement/spec.md`, `blender-asset-library/spec.md`, `spatial-world/spec.md`, `web-asset-delivery/spec.md`

- [ ] **Step 1: Add explicit archive evidence**

Move the completed archive clause into DONE with date `2026-10-02`; keep integrated-GPU acceptance open as a separate NOW task.

- [ ] **Step 2: Split order from invoice TODO**

Mark order creation/reservation only when its real API and UI tests pass. Create a separate open invoice-pricing task stating currency and add-on prices are required; do not invent either.

- [ ] **Step 3: Mark only verified checkboxes**

For each completed implementation task, list the exact focused test/report in a neighboring DONE entry. Keep Docker, integrated GPU, auth, CDN, and invoice tasks open if prerequisites remain absent.

- [ ] **Step 4: Validate OpenSpec and TODO integrity**

Run: `openspec validate --specs && git diff --check`; verify no ambiguous PNG/GLB or skill cleanup entry was changed.

### Task 2: Final full verification and release record

**Files:**
- Modify: `reports/assets/website-acceptance.md` only with new browser/performance evidence
- Modify: `TODO.md`

- [ ] **Step 1: Run project verification**

Run: `bun run verify && bun run assets:validate && bun run build`.

- [ ] **Step 2: Run browser acceptance for changed features**

Use the E2E cases from `2026-10-02-roadmap-ops-rendering-quality.md`; capture actual browser, viewport, renderer backend, and outcomes.

- [ ] **Step 3: Keep unavailable acceptance gates open**

The designated integrated-GPU laptop, auth provider, CDN storage target, invoice pricing, and working Docker daemon are explicit external prerequisites. Record any successful substitute implementation separately; do not mark their acceptance checkboxes complete.

- [ ] **Step 4: Review diff and commit**

Run: `git diff --check`; review `git diff -- TODO.md reports/assets/website-acceptance.md`; commit only evidence-backed TODO/report changes with a conventional message.
