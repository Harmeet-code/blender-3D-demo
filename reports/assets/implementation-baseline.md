# Asset implementation baseline

Recorded 2026-10-01 before runtime asset implementation.

- TypeScript: passed.
- Existing tests: 23 passed, 0 failed.
- Lint: no errors; existing warnings in presence service, WebSocket client, DB seed, and DB migration.
- Formatting initially failed in four new OpenSpec plan documents; those documents were formatted before code changes.
- Hardware: Intel Core i5-12400F; NVIDIA GeForce GT 710. An integrated-GPU reference device is unavailable on this host. Release performance measurements must identify this actual device; no reference-device result has been claimed.
- Blender was absent from PATH and standard installation/registry locations; no local MCP bridge was listening on port 9876. Portable Blender 4.5.9 LTS is being provisioned in the ignored `.cache/blender` directory with official SHA256 verification.
- The working tree contained frontend/server reorganization and other changes before this implementation. Those edits have been retained.
