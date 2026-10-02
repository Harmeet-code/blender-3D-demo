# Original venue assets

Sources are procedural Blender 4.5 LTS assets created for this project. No stock or AI-generated third-party models are included. `LicenseRef-Project-Owned` identifies project-owned source assets; the project owner determines redistribution terms.

Run the generator with Blender 4.5 LTS. On this workspace the portable executable is available below; substitute your installed executable on another machine:

```powershell
& '.cache/blender/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --python assets-source/blender/build.py -- --stage remaining --previews
bun run assets:validate --publish
```

The remaining eight assets and website integration were completed on 2026-10-02. The separate optional ceiling brings the catalog to fourteen baseline assets and five quality variants. The designated integrated-GPU laptop acceptance remains pending; see `reports/assets/website-acceptance.md`. Use `--stage first` for the initial slice, `--stage all` for the whole library, or `--asset pallet` for one asset. Each asset has a saved `.blend`, a reproducible `build.py` entry point, a self-contained `.glb`, and versioned metadata. Recipes create a candidate catalog in ignored `.cache/assets`; `assets:validate --publish` checks actual exported files before updating the released catalog. `assets:validate` checks the released catalog without publishing. `bun run assets:calibration` validates the calibration GLB and compares lossless optimization candidates.

The display case includes an `opaque` variant. Forklift, elevator entrance, stairs, and escalator entrance include `low` variants with at most half the baseline triangles. Default generation builds every supported variant; `--variant low` or `--variant opaque` rebuilds only that quality for an asset with an existing baseline. Baseline and variant sources have separate filenames and share placement interfaces.

Sources stay outside the frontend import graph. Blender distributions and temporary logs live in ignored `.cache`; published validation evidence lives in `reports/assets`. Generate native source evidence and the overview sheet with:

```powershell
& '.cache/blender/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --python assets-source/blender/verify-sources.py
& '.cache/blender/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --python assets-source/blender/render-sheet.py
```

Front, side, top, and hero views are in `src/frontend/assets/images/asset-previews`. Additional previews show the elevator doors open and square/wide banner placeholders. Website controls include a door-open preview and validated aspect-preserving logos; browser evidence is in `reports/assets`. The packed, editable overview scene is `asset-sheet.blend`.

Space: Blender X right / Z up / -Y front; GLB X right / Y up / +Z front. Units: meters, unit scale. Ground-contact roots sit at the feet plane; floor roots sit at the top plane. Portal roots sit at the lower entry plane, with thresholds allowed below it. Stairs and escalator have a 4 m rise and an 8 m full footprint including landings. Scalar PBR finishes share a small palette and need no texture downloads. Collision proxies are metadata, excluded from visible exports.
