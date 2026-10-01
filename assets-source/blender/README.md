# Original venue assets

Sources are procedural Blender 4.5 LTS assets created for this project. No stock or AI-generated third-party models are included. `LicenseRef-Project-Owned` identifies project-owned source assets; the project owner determines redistribution terms.

Run the generator with the configured Blender executable:

```powershell
blender --background --factory-startup --python assets-source/blender/build.py -- --stage first --previews
```

Prove the first five assets in the browser before running `--stage remaining`. Each asset has a saved `.blend`, a small reproducible `build.py` entry point, a self-contained `.glb`, and source/export metadata. Sources stay outside the frontend import graph. Blender distributions and temporary logs live in ignored `.cache`; published validation evidence lives in `reports/assets`.

Space: Blender X right / Z up / -Y front; GLB X right / Y up / +Z front. Units: meters, unit scale. Ground-contact roots sit at the feet plane; floor roots sit at the top plane. Scalar PBR finishes share a small palette and need no texture downloads.
