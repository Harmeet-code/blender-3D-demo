# Roadmap TODO Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and verify every currently actionable TODO checkbox while keeping hardware-, provider-, and pricing-dependent work explicitly open.

**Architecture:** Execute four bounded plans in dependency order: data/commerce, world behavior, operations/rendering, then acceptance/TODO reconciliation. Preserve existing entity clients, `Result` error handling, Fastify feature slices, and R3F ownership; each slice adds tests before implementation and commits only its own files.

**Tech Stack:** React 19, Zustand, Three.js/R3F, Fastify 5, Bun, Zod, Postgres, Redis, Recast Navigation, Vite, Playwright.

---

## Scope and dependency order

1. `2026-10-02-roadmap-foundation-commerce.md` — API-fed layout, reservation UI, pending orders, rate limiting, live infra and CI.
2. `2026-10-02-roadmap-world-experience.md` — live presence, NavMesh routing, wall meshes, dollhouse transitions, teleport/autopilot.
3. `2026-10-02-roadmap-ops-rendering-quality.md` — bundle splitting, AO, WebGPU fallback, E2E; auth/CDN are deferred.
4. `2026-10-02-roadmap-acceptance-reconciliation.md` — run evidence-based gates and update `TODO.md`.

Do not start a dependent slice before its predecessor is verified: layout data precedes navigation; reservation service precedes browser reservation tests; renderer changes precede the final E2E/browser pass.

## Deferred items and blockers

- Keep integrated-GPU laptop acceptance open until the specified laptop is available; the current host is a desktop with NVIDIA GT 710.
- Keep admin authentication open until an identity provider is selected. Do not ship placeholder or client-only authorization.
- Keep CDN hosting open until a storage/CDN deployment target is selected.
- Keep invoice issuance open until prices and currency are defined. The existing pending-order reservation may be completed without inventing monetary values.
- Retry Docker-backed migration/seed only when Docker Desktop is available; do not mark the live-infra gate complete from mocks.
- Leave the uncheckboxed PNG/GLB and skills cleanup notes untouched until exact targets are supplied.

## Final acceptance

Run focused checks listed in each plan, then `bun run verify`, `bun run build`, `bun run assets:validate`, and browser checks for API layout loading, reserve success/failure, navigation, and renderer fallback. Update checkboxes only for checks with passing evidence; split combined TODO items where one part is complete and another remains externally blocked.
