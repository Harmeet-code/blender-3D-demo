# Blender reference snapshot

Created with `bun scripts/assets/snapshot-blender-reference.ts`. This is a verified copy; original sources and current application assets have not been moved or deleted.

- `manifest.v1.json`: relative source paths, byte counts and SHA-256 of each archived file.
- `reference-sheet.html`: 100 existing local visual references. Open directly in a browser.
- Re-running accepts identical bytes and refuses to overwrite a changed reference. Source removal requires separately recorded runtime detachment and approved visual parity.
- This directory is outside Vite public/src roots. The runtime archive guard rejects source imports and URLs referencing it.

Preserved 276 files (427881276 bytes). No Blender executable or dependency cache is copied.
