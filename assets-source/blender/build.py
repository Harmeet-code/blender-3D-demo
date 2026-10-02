"""Deterministic original venue kit. Run inside Blender, never in system Python.

blender --background --factory-startup --python assets-source/blender/build.py -- --stage first
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[2]
MODEL_DIR = PROJECT / "src/frontend/assets/models"
META_DIR = PROJECT / "src/frontend/assets/metadata"
PREVIEW_DIR = PROJECT / "src/frontend/assets/images/asset-previews"
SOURCE_DIR = PROJECT / "assets-source/blender"
sys.path.insert(0, str(SOURCE_DIR))
VERSION = "1.1.0"
FIRST = ["floor-tile", "wall-panel", "booth-frame", "chair", "table", "booth-ceiling"]
BUDGETS = {
    "booth-ceiling": (100, 1),
    "floor-tile": (100, 1), "wall-panel": (200, 1), "booth-frame": (2000, 2),
    "chair": (800, 1), "table": (500, 1), "display-case": (1500, 2),
    "safe": (1000, 1), "pallet": (500, 1), "forklift": (6000, 3),
    "banner-stand": (500, 2), "elevator-entrance": (3000, 3),
    "stairs": (2000, 2), "escalator-entrance": (4000, 3),
}
COLORS = {
    "panel": (0.73, 0.77, 0.79, 1), "frame": (0.035, 0.07, 0.10, 1),
    "branding": (0.02, 0.38, 0.50, 1), "chair": (0.045, 0.20, 0.26, 1),
    "wood": (0.52, 0.34, 0.17, 1), "metal": (0.27, 0.32, 0.37, 1),
    "yellow": (0.98, 0.53, 0.025, 1), "glass": (0.40, 0.72, 0.83, 0.24),
    "glass_opaque": (0.40, 0.72, 0.83, 1),
    "floor": (0.18, 0.22, 0.26, 1),
}


def xyz(value):
    """Export-space X/Y/Z to Blender X/-Y/Z."""
    return (value[0], -value[2], value[1])


def material(name):
    key = "finish_" + name
    existing = bpy.data.materials.get(key)
    if existing:
        return existing
    result = bpy.data.materials.new(key)
    result.use_nodes = True
    result.diffuse_color = COLORS[name]
    bsdf = result.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = COLORS[name]
    bsdf.inputs["Roughness"].default_value = 0.4 if name == "metal" else 0.62
    bsdf.inputs["Metallic"].default_value = 0.7 if name == "metal" else 0
    if name == "glass":
        bsdf.inputs["Alpha"].default_value = 0.24
        bsdf.inputs["Roughness"].default_value = 0.18
        result.surface_render_method = "DITHERED"
    return result


def box(root, name, size, position, finish="panel", bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(position))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = root
    obj.data.materials.append(material(finish))
    if bevel:
        mod = obj.modifiers.new("edge_bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def socket(root, name, position):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj.location = xyz(position)
    return obj


def cylinder(root, name, radius, depth, position, finish, axis="Y", vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz(position))
    obj = bpy.context.object
    obj.name = name
    if axis == "X":
        obj.rotation_euler[1] = math.pi / 2
    elif axis == "Z":
        obj.rotation_euler[0] = math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.parent = root
    obj.data.materials.append(material(finish))
    return obj


def model(asset_id, quality="baseline"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    root = bpy.data.objects.new("root", None)
    bpy.context.collection.objects.link(root)
    root["asset_id"] = asset_id
    root["asset_version"] = 1
    root["generator_version"] = VERSION
    root["quality_variant"] = quality
    if asset_id not in FIRST:
        sys.path.insert(0, str(SOURCE_DIR))
        from remaining import build_remaining
        return build_remaining(asset_id, quality, root, box, cylinder, socket, material, xyz)
    sockets = {}
    anchor = "floor-contact"
    if asset_id == "floor-tile":
        box(root, "mesh_floor", (4, .2, 4), (0, -.1, 0), "floor")
        anchor = "floor-top"
    elif asset_id == "booth-ceiling":
        box(root, "mesh_ceiling", (4, .08, 4), (0, .04, 0), "panel")
    elif asset_id == "wall-panel":
        box(root, "mesh_panel", (1, 2.5, .1), (0, 1.25, 0), bevel=.004)
    elif asset_id == "booth-frame":
        box(root, "mesh_rear", (4, 2.5, .1), (0, 1.25, -1.95))
        for sign in [-1, 1]:
            box(root, f"mesh_side_{sign}", (.1, 2.5, 3.9), (sign * 1.95, 1.25, .05))
        box(root, "mesh_branding", (4, .28, .1), (0, 2.36, 1.95), "branding")
        sockets = {"socket_branding": [0, 2.36, 2.003], "socket_entry": [0, 0, 2]}
    elif asset_id == "chair":
        box(root, "mesh_seat", (.5, .08, .55), (0, .41, 0), "chair", .005)
        box(root, "mesh_back", (.5, .4, .06), (0, .65, -.245), "chair", .005)
        for x in [-.21, .21]:
            for z in [-.21, .21]:
                box(root, f"mesh_leg_{x}_{z}", (.055, .37, .055), (x, .185, z), "chair")
    elif asset_id == "table":
        box(root, "mesh_top", (1.2, .06, .6), (0, .72, 0), "wood", .005)
        for x in [-.51, .51]:
            for z in [-.21, .21]:
                box(root, f"mesh_leg_{x}_{z}", (.08, .69, .08), (x, .345, z), "wood")
    for name, position in sockets.items():
        socket(root, name, position)
    return root, anchor, sockets


def export_asset(asset_id, previews, quality="baseline"):
    root, anchor, sockets = model(asset_id, quality)
    suffix = "" if quality == "baseline" else f".{quality}"
    objects = [root] + list(root.children_recursive)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    # Ensure matrices reflect all newly assigned transforms before measuring/exporting.
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    source_min = [min(p[i] for p in points) for i in range(3)]
    source_max = [max(p[i] for p in points) for i in range(3)]
    # Micro-meter rounding removes float noise without changing the 5 mm interface tolerance.
    lower = [round(value, 6) for value in [source_min[0], source_min[2], -source_max[1]]]
    upper = [round(value, 6) for value in [source_max[0], source_max[2], -source_min[1]]]
    dimensions = [upper[i] - lower[i] for i in range(3)]
    materials = {mat.name for obj in meshes for mat in obj.data.materials}
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    source = SOURCE_DIR / asset_id
    source.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source / f"{asset_id}{suffix}.blend"))
    (source / f"build{suffix}.py").write_text(
        'import runpy, sys\nfrom pathlib import Path\n'
        f'sys.argv = [sys.argv[0], "--", "--asset", "{asset_id}", "--variant", "{"all" if quality == "baseline" else quality}"]\n'
        'runpy.run_path(str(Path(__file__).resolve().parents[1] / "build.py"), run_name="__main__")\n',
        encoding="utf-8",
    )
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    output = MODEL_DIR / f"{asset_id}.v1{suffix}.glb"
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
        export_yup=True, export_cameras=False, export_lights=False, export_animations=False,
        export_extras=True, export_materials="EXPORT")
    structural = asset_id in ["floor-tile", "wall-panel", "booth-frame", "booth-ceiling", "elevator-entrance", "stairs", "escalator-entrance"]
    roles = {name: "branding" if "branding" in name else "glass" if "glass" in name else "frame" if name == "finish_frame" else "surface" for name in sorted(materials)}
    metadata = {
        "id": asset_id, "version": 1, "label": asset_id.replace("-", " ").title(),
        "anchor": anchor, "facing": "+Z", "dimensions": dimensions,
        "bounds": {"min": lower, "max": upper},
        "footprint": [[lower[0], lower[2]], [upper[0], lower[2]], [upper[0], upper[2]], [lower[0], upper[2]]],
        "requiredNodes": ["root"] + list(sockets) + (["door_left", "door_right"] if asset_id == "elevator-entrance" else []),
        "materialRoles": roles,
        "sockets": {name: {"position": position, "rotation": [0, 0, 0]} for name, position in sockets.items()},
        "colliders": [{"halfExtents": [value / 2 for value in dimensions], "position": [(lower[i] + upper[i]) / 2 for i in range(3)], "rotation": [0, 0, 0]}],
        "source": {"blend": f"assets-source/blender/{asset_id}/{asset_id}{suffix}.blend", "recipe": f"assets-source/blender/{asset_id}/build{suffix}.py", "license": "LicenseRef-Project-Owned", "generatorVersion": VERSION},
        "budget": {"triangles": BUDGETS[asset_id][0], "materials": BUDGETS[asset_id][1], "bytes": 2097152 if structural else 1048576, "textureSize": 2048 if structural else 1024},
        "metrics": {"triangles": triangles, "materials": len(materials), "bytes": output.stat().st_size, "textureBytes": 0},
    }
    if asset_id in ["stairs", "escalator-entrance"]:
        metadata["portalRise"] = 4
    if asset_id == "booth-frame":
        metadata["branding"] = {"node": "mesh_branding", "socket": "socket_branding", "width": 3.6, "height": .24, "normal": [0, 0, 1], "defaultNodes": []}
        metadata["requiredNodes"].append("mesh_branding")
    # A booth/elevator needs an entrance gap; collision is composed from its frame pieces.
    if asset_id in ["booth-frame", "elevator-entrance"]:
        metadata["colliders"] = []
        for obj in meshes:
            if obj.name.startswith("mesh_side") or obj.name in ["mesh_rear"] or (asset_id == "elevator-entrance" and obj.name.startswith("mesh_frame")):
                size = obj.dimensions
                center = obj.matrix_world.translation
                metadata["colliders"].append({"halfExtents": [size.x / 2, size.z / 2, size.y / 2], "position": [center.x, center.z, -center.y], "rotation": [0, 0, 0]})
    if asset_id not in FIRST:
        from remaining import interface_details
        details = interface_details(asset_id)
        metadata["requiredNodes"] += details.pop("requiredNodes", [])
        metadata.update(details)
    (META_DIR / f"{asset_id}.v1{suffix}.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if previews:
        render_previews(asset_id + suffix, dimensions)
        if asset_id == "elevator-entrance" and quality == "baseline":
            left, right = bpy.data.objects["door_left"], bpy.data.objects["door_right"]
            left.location.x -= .82
            right.location.x += .82
            render_previews(asset_id + ".door-open", dimensions, views=[("hero", (1, -1, .85))])
            left.location.x += .82
            right.location.x -= .82
        if asset_id == "banner-stand":
            for name in metadata["branding"]["defaultNodes"]:
                bpy.data.objects[name].hide_render = True
            for name, size in [("square", (.8, .8, .003)), ("wide", (.9, .3, .003))]:
                sample = box(root, "preview_logo", size, (0, 1.1, .019), "panel")
                render_previews(asset_id + ".logo-" + name, dimensions, views=[("front", (0, -1, .05))])
                bpy.data.objects.remove(sample, do_unlink=True)
    print("ASSET_EXPORTED", asset_id, quality, triangles, output.stat().st_size, flush=True)
    return metadata


def render_previews(asset_id, dimensions, views=None):
    scene = bpy.context.scene
    for obj in list(scene.objects):
        if obj.type in ["LIGHT", "CAMERA"]:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in scene.objects if obj.type == "MESH" for corner in obj.bound_box]
    lower = Vector([min(p[i] for p in points) for i in range(3)])
    upper = Vector([max(p[i] for p in points) for i in range(3)])
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 12
    scene.render.resolution_x = 384
    scene.render.resolution_y = 384
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("preview_world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.65, .72, .8, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .65
    bpy.ops.object.light_add(type="AREA", location=(3, -4, 6))
    bpy.context.object.data.energy = 500
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    scene.camera = camera
    camera.data.type = "ORTHO"
    extent = max(upper - lower)
    camera.data.ortho_scale = extent * 1.55
    target = (lower + upper) / 2
    for view, direction in views or [("front", (0, -1, .18)), ("side", (1, 0, .18)), ("top", (0, -.01, 1)), ("hero", (1, -1, .85))]:
        camera.location = target + Vector(direction).normalized() * (extent * 3 + 1)
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(PREVIEW_DIR / f"{asset_id}.{view}.png")
        bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["first", "remaining", "all"], default="first")
    parser.add_argument("--asset", choices=list(BUDGETS))
    parser.add_argument("--previews", action="store_true")
    parser.add_argument("--variant", choices=["all", "baseline", "low", "opaque"], default="all")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    for path in [MODEL_DIR, META_DIR, PREVIEW_DIR]:
        path.mkdir(parents=True, exist_ok=True)
    assets = [args.asset] if args.asset else FIRST if args.stage == "first" else list(BUDGETS) if args.stage == "all" else [key for key in BUDGETS if key not in FIRST]
    for asset_id in assets:
        from remaining import QUALITY_VARIANTS
        qualities = QUALITY_VARIANTS.get(asset_id, [])
        if args.variant not in ["all", "baseline"] and args.variant not in qualities:
            raise ValueError(f"Unsupported quality {args.variant} for {asset_id}")
        if args.variant in ["all", "baseline"]:
            metadata = export_asset(asset_id, args.previews)
        else:
            metadata = json.loads((META_DIR / f"{asset_id}.v1.json").read_text(encoding="utf-8"))
        for quality in qualities:
            if args.variant not in ["all", quality]:
                continue
            variant = export_asset(asset_id, args.previews, quality)
            metadata.setdefault("variants", {})[quality] = {
                "file": f"{asset_id}.v1.{quality}.glb",
                "source": variant["source"], "metrics": variant["metrics"],
                "materialRoles": variant["materialRoles"],
            }
        (META_DIR / f"{asset_id}.v1.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    catalog = [json.loads(path.read_text(encoding="utf-8")) for path in
               [META_DIR / f"{asset_id}.v1.json" for asset_id in sorted(BUDGETS)] if path.exists()]
    candidate_dir = PROJECT / ".cache/assets"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    (candidate_dir / "catalog.candidate.v1.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print("CATALOG_CANDIDATE_READY: run bun run assets:validate --publish", flush=True)


if __name__ == "__main__":
    main()
