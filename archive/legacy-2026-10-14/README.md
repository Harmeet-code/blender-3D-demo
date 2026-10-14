# Legacy archive — 14 October 2026

174 files, 153,065,584 bytes (about 146 MiB), moved from the working tree into
`payload/` with their original relative paths. Nothing was deleted. All moved
bytes were checked against SHA-256 hashes before and after the move.

`manifest.json` is the restoration ledger: each entry has its original path,
archive path, size, hash and reason. `verification.json` records the final
integrity/import check. Payloads remain local and are excluded from Git, Docker
build context, formatting and lint; copy this whole directory separately when
transferring the project to another machine. The earlier `archive/blender-ref/`
snapshot is unchanged.

## Contents

- 20 GLBs: 19 detached built-in exports and the original mall GLB.
- 25 JSON files: detached per-export metadata, superseded reports and scratch data.
- 8 Markdown files and one historical plan audit: superseded plans, handoffs
  and the old source-assets guide.
- 85 PNGs, one JPEG and one WebP: native preview references and temporary fixtures.
- The old uncompressed mall blueprint, Draco decoder/license files, 17 Blender
  autosaves, Python bytecode and scratch logs/search results.

Native previews are preserved here for future visual comparison. Archived
documents retain their exact historical bytes, including old paths and commands;
use the manifest to resolve their relocated references. Historical audit scripts
are evidence, not current runnable tools.

## Preserved dependencies

The active mall manifest and `4299c72a60228f3c526e` compressed blueprint remain.
The earlier `b9763eccdb3c4c6abe19` compressed blueprint stays available for
cached-client compatibility; removal needs an explicit deployment retention window.
Both floor images, source image, live layout JSON, shell GLBs and all eight public
booth GLBs/previews remain because seed or saved-layout compatibility needs them.
Uploads, local layouts/drafts, Venue OS state, editable `.blend` sources, Blender
generators and tool installation were preserved. Five source metadata JSON files
remain, including the chair and booth-frame metadata still imported by editor
and physical collision code.

The audit inspected local filesystem documents only. It did not query external
PostgreSQL records or browser-local drafts. No generic public-media garbage
collection was performed. A lack of a static import alone is not a reason to
remove saved-layout media or content-addressed release assets.

## Verify or restore

From the project root in PowerShell:

```powershell
& ./scripts/maintenance/manage-legacy-archive.ps1 -Mode Verify
& ./scripts/maintenance/manage-legacy-archive.ps1 -Mode Restore
```

Verification checks archived hashes, unchanged protected files and all previously
resolved imports. Restore preflights every hash and destination, refuses to
overwrite a file, and moves files back to their original locations. If active
files were edited since the archive, the protected-file check intentionally
refuses the operation; review those differences first. Completed moves are
journaled in the manifest, so a partial interruption remains traceable.

## Existing checkout problems

Before any move, both TypeScript and production build failed because Vite imports
three files already absent from this checkout:

- `scripts/vite/asset-revisions.ts`
- `scripts/assets/archive-runtime-guard.ts`
- `scripts/vite/mall-blueprint-cache.ts`

The floor tile templates also refer to directories already absent from `public/`.
`scripts/assets/` was absent before this pass, so existing asset validation and
regeneration commands do not currently have their implementation files.
These files are not in this cleanup's archive and were not removed by it.
After the move, TypeScript reports the same three missing-module errors.
Successful build or live-browser regression verification is therefore not claimed.
