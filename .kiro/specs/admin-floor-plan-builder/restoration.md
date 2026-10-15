# Specification recovery and reconciliation

Recovery began on 14 October 2026; reconciliation was completed on 15 October 2026.

## Provenance

The spec files were untracked before the condensed rewrite, so Git history contained no versions
to restore. Full copies were recovered from Kiro's local file history for this exact workspace.
The Codex session history also recorded the pre-rewrite inventory: requirements 244 lines,
design 1,915 lines and tasks 424 lines. The original plan contains 43 numbered tasks.

The session used for corroboration is
`01a139a3-fe30-7563-b0ad-e01abad77d0c`. Its file-inventory output and earlier spec reads corroborate
the recovered documents; no unrelated session content was copied into the repository.

## Preserved copies

- `snapshots/kiro-before-rewrite/`: exact recovered Kiro documents, unchanged by reconciliation.
- `snapshots/condensed-before-restoration/`: the shorter replacement documents as they existed
  immediately before restoration, retained for comparison.
- `requirements.md`, `design.md`, `tasks.md`: restored working specifications with targeted
  corrections, explicit missing-feature work and current implementation limitations.

Recovered snapshot hashes were rechecked against the Kiro source files after reconciliation:

| File | Recovered lines | SHA-256 |
|---|---:|---|
| requirements.md | 244 | B97F6277D8962CAEEF076D1814E0CD06384F854F64BBBCFC069F978CBC8BE3D7 |
| design.md | 1915 | A850342884AB9FF4A3B70A7FF7B93BC5C5AADB3B59D20B59A40BB8DB42F12916 |
| tasks.md | 424 | F6CFBD7B9FAC0DFEF6923B6ED5D4F0CE0285037B5EDBCF586EFF71856D743FBF |

The snapshots are historical evidence, not competing implementation instructions. Use the working
specifications as the current contract. They preserve the detailed feature scope while correcting
unsafe/contradictory examples from the recovered documents.

## Retained scope and corrections

- Original requirements 1-12 and tasks 1-43 retain their identifiers and detailed responsibilities.
- Additive Requirement 13 records all 25 supplied Demo parity TODO entries, P01-P25.
- Tasks 44-63 record missing/partial work; the parity table maps each item to acceptance and tasks.
- P24 Blazor HostBridge stays declined: no Blazor host; share URLs and iframe embedding cover it.
- P25 demo grid A* stays declined: Recast remains the engine. The former studio grid router was
  recorded as a mismatch during restoration and replaced by the shared Recast worker during implementation.
- Polygon storage uses distinct vertices with implicit closure; no explicit closing-point check.
- Collision uses transformed polygons with edge contact allowed; arbitrary spacing requirements
  and center-distance heuristics were corrected.
- Backend metadata requires reversible serialization through the unchanged wire parser; publication
  versions are owned by the existing API client. No obsolete floor-plan endpoints/private map edits.
- R3F examples use native JSX, owned resources and floor-contact geometry. Detailed procedural
  rendering remains later work; external model loading is prohibited in all phases.
- Duplicate/superseded API/history examples were reconciled into a single current contract.
- Viewer sidebar/HUD, view toggles, auto-tour, debug tools, zone point-undo and staged removal have
  explicit design and pending work, rather than being implied by a generic editor task.

## Verification of the documents

Document-only checks confirmed:

- 13 numbered requirement sections with contiguous acceptance criteria.
- 63 unique, contiguous task IDs; original IDs 1-43 remain present.
- All P01-P25 rows present once in the parity table and covered by Requirement 13.
- Requirement references in task/property mappings resolve to existing acceptance criteria.
- Dependency phases contain 48 implementation/check tasks plus 15 separately deferred test tasks,
  covering every task exactly once.
- Markdown code fences are balanced and recovered snapshot hashes match their source files.

These are specification consistency checks, not application tests. Tasks 28-42 remain deferred by
the user's instruction to skip tests. No implementation task was marked complete during this
restoration. Feature gaps and live backend verification remain open as recorded in tasks.md.

Implementation then continued on 15 October 2026. The canonical task statuses now distinguish
46 implemented/reviewed tasks, open backend work in tasks 44 and 49 and 15 deferred test tasks.
Detailed specifications and the historical snapshots remain retained; the implementation update
does not replace their scope with a shorter plan. See the feature README for paths and check results.

The subsequent [implementation audit](implementation-audit.md) corrected additional deviations and
reopened task 49 after tracing the unchanged backend's bounding-box fallback for procedural instances.
The restored snapshots and all original requirement/task identifiers remain unchanged.

## Source snapshot locations

The recovered Kiro entries, relative to `%APPDATA%/Kiro/User/History/`, are:

- requirements: `5a63bed0/W6Ms.md`
- design: `6372a322/M0k9.md`
- tasks: `-6af656c4/WxFN.md`

The targeted `.gitignore` exceptions make these three working specs, this recovery record and both
snapshot sets eligible for version control while other Kiro state stays ignored. Recovery does not
itself create a commit or push.
