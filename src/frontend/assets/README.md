# assets

Static 3D + 2D content, colocated with code so slices import relatively:

- `models/` — modular GLTF/GLB booth props (chair, table, display case, lift)
- `textures/` — baked AO/lightmaps (`uv2`), banner/logo textures
- `hdri/` — environment maps for the lighting rig
- `images/` — uploaded floor-plan JPG/PNG originals (large files: prefer object storage, keep thumbnails only)

Import via Vite: `import chairUrl from '@/frontend/assets/models/chair.glb?url'`.
