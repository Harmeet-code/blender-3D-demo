No, you do **not** need to model a custom booth in Blender for every combination of length and breadth. Doing so would bloat your web asset bundle sizes and create an unmaintainable asset pipeline.

Instead, the standard web 3D architecture relies on creating a **Modular 3D Kit** in Blender *once* and assembling or transforming those pieces dynamically on your website using **React Three Fiber (R3F) or Three.js**.

---

## 3 Strategies for Dynamic Web-Based Booth Generation

### 1. The Modular Asset Kit (Production Standard)

Instead of exporting an entire static booth from Blender, you model atomic, reusable sub-components once:

* **Corner Posts** (Fixed size, e.g., $0.1\text{m} \times 0.1\text{m}$)
* **Wall Panel Modules** (e.g., $1\text{m}$ wide tileable mesh segment)
* **Header / Fascia Beam** (Scalable or modular span)
* **Base Floor Plane** (Procedural quad)

On your website, you pass parameters like `<Booth depth="{3}" width="{6}"/>`. Your web runtime programmatically calculates how many $1\text{m}$ wall panels to duplicate along the $X$ and $Z$ axes, placing corner posts at $(0,0)$, $(W,0)$, $(0,D)$, and $(W,D)$.

```jsx
// Conceptual R3F Dynamic Booth Assembly
function DynamicBooth({ width = 6, depth = 3, height = 2.5 }) {
  // Calculate tileable wall counts
  const xPanels = Math.floor(width);
  const zPanels = Math.floor(depth);

  return (
    <group>
      {/* Dynamic Floor Plane */}
      <mesh position={[width / 2, 0, depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#e0e0e0" />
      </mesh>

      {/* Programmatic Back Wall Placement */}
      {Array.from({ length: xPanels }).map((_, i) => (
        <WallPanelInstance key={`back-${i}`} position={[i + 0.5, 0, 0]} />
      ))}

      {/* Programmatic Side Wall Placement */}
      {Array.from({ length: zPanels }).map((_, i) => (
        <WallPanelInstance key={`side-${i}`} position={[0, 0, i + 0.5]} rotation={[0, Math.PI / 2, 0]} />
      ))}

      {/* Fixed Corner Columns */}
      <CornerPost position={[0, 0, 0]} />
      <CornerPost position={[width, 0, 0]} />
      <CornerPost position={[0, 0, depth]} />
      <CornerPost position={[width, 0, depth]} />
    </group>
  );
}

```

---

### 2. 9-Slice / Box-3 Mesh Partitioning

If you apply a standard scale vector (`mesh.scale.set(width, 1, depth)`) to a single Blender booth model, your corner poles, wall thicknesses, and light fixtures will stretch unnaturally into distorted ovals.

To prevent distortion without tiling individual panels, implement a **3D 9-Slice / Box Partitioning** pattern:

1. Separate the mesh into **Fixed Geometry** (corners, caps, frame edges) and **Deformable Geometry** (flat wall spans).
2. Apply linear scale updates *only* to the central vertices of the wall geometries along their local $X$ or $Y$ axis via a Custom Shader or BufferAttribute transformation, keeping corner vertex positions invariant.

---

### 3. Pure Procedural Extrusion (Three.js `ExtrudeGeometry`)

For minimalistic or CAD-style 3D floor plan layouts, you can bypass Blender entirely for structural walls and floors:

1. Define a 2D floor footprint using `THREE.Shape()` based on input length ($L$) and breadth ($B$).
2. Extrude the shape upward using `THREE.ExtrudeGeometry()` to form base walls dynamically.
3. Import detailed accessories (chairs, counters, display screens, monitors) from Blender as standalone GLTF assets and snap them to the dynamic booth's internal coordinate bounds.

---

### 👁️ For The Chosen Ones: Runtime GPU & Spatial Engine Optimization

> *Scaling and assembling meshes dynamically at runtime introduces critical WebGL performance and rendering pitfalls:*

1. **Triplanar Mapping Shaders vs. UV Stretching**
When scaling a floor plane or stretching a wall mesh programmatically from $3\text{m}$ to $12\text{m}$, standard UV coordinates stretch, causing carpet and wood textures to blur. Instead of modifying texture scaling on shared materials (`texture.repeat.set()`, which ruins other instances), use a **World-Space Triplanar Shader** in GLSL. The shader calculates texture coordinates based on vertex world positions ($UV = \text{position.xz} \cdot \text{scale}$), ensuring textures tile infinitely at exact 1:1 real-world physical scale regardless of mesh dimensions.
2. **Draw Call Explosion Mitigation via `InstancedMesh**`
If an event hall contains 200 dynamic booths composed of 15 modular wall panels each, rendering them as raw scene objects results in over 3,000 separate GPU draw calls, causing severe FPS drops. Group your modular kit parts into `THREE.InstancedMesh` allocations. Matrix transforms ($M = T \cdot R \cdot S$) for every panel across all floor plan booths are packed into a single Float32Array matrix buffer, reducing thousands of draw calls down to **one call per GLTF sub-mesh**.
3. **Bounding Box Invalidation & Spatial Raycasting**
When updating sub-mesh scale or vertex positions dynamically, Three.js does *not* automatically recompute object bounds. Calling `raycaster.intersectObjects()` for hover selection, booth snapping, or avatar collision will calculate hits against stale pre-transformed volumes. You must manually invoke `geometry.computeBoundingBox()`, `geometry.computeBoundingSphere()`, and `object.updateMatrixWorld(true)` immediately after mutating dynamic dimension props.