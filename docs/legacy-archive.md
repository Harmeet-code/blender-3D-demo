# Legacy file cleanup — 14 October 2026

The confirmed legacy files now live in
[the dated archive](../archive/legacy-2026-10-14/README.md). The cleanup moved
174 files (about 146 MiB) without deleting content. The
[manifest](../archive/legacy-2026-10-14/manifest.json) records every original path,
new path, SHA-256 and reason. The original Blender reference snapshot remains.

Current guides are `reusable-r3f-objects.md`, `mall-procedural-execution.md`,
`R3F-execution.md`, `R3F-loading-cache.md`, `R3F-migration-execution.md`,
`v2-v3-status.md` and `venue-authoring.md`. The modular booth proposal is also
retained because its arbitrary-size assembly work remains pending. Older R3F
proposals/reviews, the migration snapshot inventory, the OpenCode handoff and
the superseded V2/V3 execution plan are under the archive's `payload/docs/`.

The reusable-object and built-in inventory galleries render native R3F recipes.
Historical source preview images and built-in GLBs were detached from those
runtime paths and are preserved in the archive for modeling comparison. Active
catalog/booth metadata, physical/editor metadata, floor images, saved shells,
public booth exports/previews, uploads and editable `.blend` sources stay in place.
Old public GLBs still needed for saved layouts were not swept by extension.

Integrity verification confirmed 485 protected files unchanged and 1,040
previously resolved imports still present. Compiler/build checks encountered the
same three missing Vite helper files before and after cleanup; see the archive
guide for exact paths and the existing missing tile/tooling limitations.

Restore is available through `scripts/maintenance/manage-legacy-archive.ps1`.
Archive payloads are excluded from deployment/build context and code lint/format
scanning. This is a reversible repository cleanup, not a release-media retention
or database garbage-collection operation.
