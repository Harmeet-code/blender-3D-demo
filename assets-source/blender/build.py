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
VERSION = "1.0.0"
FIRST = ["floor-tile", "wall-panel", "booth-frame", "chair", "table"]
BUDGETS = {
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


def model(asset_id):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    root = bpy.data.objects.new("root", None)
    bpy.context.collection.objects.link(root)
    sockets = {}
    anchor = "floor-contact"
    if asset_id == "floor-tile":
        box(root, "mesh_floor", (4, .2, 4), (0, -.1, 0), "floor")
        anchor = "floor-top"
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
    elif asset_id == "display-case":
        box(root, "mesh_cabinet", (1.2, .65, .5), (0, .325, 0), "frame", .006)
        box(root, "mesh_glass", (1.18, .45, .48), (0, .875, 0), "glass")
        box(root, "mesh_shelf", (1.16, .025, .46), (0, .68, 0), "frame")
    elif asset_id == "safe":
        box(root, "mesh_body", (.6, .8, .6), (0, .4, 0), "metal", .012)
        box(root, "mesh_door", (.5, .67, .025), (0, .4, .2875), "metal", .004)
        box(root, "mesh_handle", (.12, .04, .03), (.11, .42, .29), "metal")
    elif asset_id == "pallet":
        for i in range(5):
            box(root, f"mesh_board_{i}", (1.2, .035, .13), (0, .1325, -.335 + i * .1675), "wood")
        for x in [-.48, 0, .48]:
            box(root, f"mesh_runner_{x}", (.14, .035, .8), (x, .0175, 0), "wood")
            for z in [-.28, 0, .28]:
                box(root, f"mesh_block_{x}_{z}", (.14, .08, .14), (x, .075, z), "wood")
    elif asset_id == "banner-stand":
        box(root, "mesh_base", (1, .045, .3), (0, .0225, 0), "frame")
        box(root, "mesh_banner", (.95, 1.8, .02), (0, 1.1, 0), "branding")
        for x in [-.46, .46]:
            box(root, f"mesh_post_{x}", (.03, 1.9, .03), (x, .95, -.02), "frame")
        sockets = {"socket_branding": [0, 1.1, .013]}
    elif asset_id == "forklift":
        box(root, "mesh_chassis", (1.05, .55, 1.65), (0, .6, -.45), "yellow", .03)
        box(root, "mesh_counterweight", (1.05, .45, .45), (0, .95, -1.0), "yellow", .025)
        box(root, "mesh_seat", (.42, .14, .4), (0, 1.05, -.4), "frame")
        for x in [-.53, .53]:
            for z in [-.9, .1]:
                cylinder(root, f"mesh_wheel_{x}_{z}", .3, .14, (x, .3, z), "frame", "X")
        for x in [-.43, .43]:
            box(root, f"mesh_mast_{x}", (.07, 1.9, .08), (x, 1.2, .48), "metal")
            for z in [-.9, .2]:
                box(root, f"mesh_cab_post_{x}_{z}", (.045, 1.25, .045), (x, 1.55, z), "metal")
        box(root, "mesh_roof", (1.1, .06, 1.35), (0, 2.17, -.35), "yellow")
        for x in [-.33, .33]:
            box(root, f"mesh_fork_{x}", (.12, .07, 1.55), (x, .14, 1.0), "metal")
    elif asset_id == "elevator-entrance":
        anchor = "portal-entry"
        for x in [-.9, .9]:
            box(root, f"mesh_frame_{x}", (.2, 2.6, .3), (x, 1.3, 0), "metal")
        box(root, "mesh_lintel", (1.6, .2, .3), (0, 2.5, 0), "metal")
        for name, x in [("door_left", -.4), ("door_right", .4)]:
            box(root, name, (.79, 2.4, .08), (x, 1.2, -.06), "panel")
        box(root, "mesh_button", (.08, .16, .04), (.9, 1.1, .12), "branding")
        sockets = {"portal_lower": [0, 0, .2]}
    elif asset_id in ["stairs", "escalator-entrance"]:
        anchor = "portal-entry"
        count = 20 if asset_id == "stairs" else 16
        for i in range(count):
            rise = 4 * (i + 1) / count
            depth = 6 / count
            box(root, f"mesh_step_{i:02}", (2, rise, depth), (0, rise / 2, -depth * (i + .5)), "frame")
        for x in [-.95, .95]:
            rail = box(root, f"mesh_rail_{x}", (.07, .07, math.hypot(6, 4)), (x, 2.85, -3), "metal")
            rail.rotation_euler[0] = -math.atan2(4, 6)
        sockets = {"portal_lower": [0, 0, 0], "portal_upper": [0, 4, -6]}
    for name, position in sockets.items():
        socket(root, name, position)
    return root, anchor, sockets


def export_asset(asset_id, previews):
    root, anchor, sockets = model(asset_id)
    objects = [root] + list(root.children_recursive)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    # Ensure matrices reflect all newly assigned transforms before measuring/exporting.
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    source_min = [min(p[i] for p in points) for i in range(3)]
    source_max = [max(p[i] for p in points) for i in range(3)]
    lower = [source_min[0], source_min[2], -source_max[1]]
    upper = [source_max[0], source_max[2], -source_min[1]]
    dimensions = [upper[i] - lower[i] for i in range(3)]
    materials = {mat.name for obj in meshes for mat in obj.data.materials}
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    source = SOURCE_DIR / asset_id
    source.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source / f"{asset_id}.blend"))
    (source / "build.py").write_text(
        'import runpy, sys\nfrom pathlib import Path\n'
        f'sys.argv = [sys.argv[0], "--", "--asset", "{asset_id}"]\n'
        'runpy.run_path(str(Path(__file__).resolve().parents[1] / "build.py"), run_name="__main__")\n',
        encoding="utf-8",
    )
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    output = MODEL_DIR / f"{asset_id}.v1.glb"
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
        export_yup=True, export_cameras=False, export_lights=False, export_animations=False,
        export_extras=True, export_materials="EXPORT")
    structural = asset_id in ["floor-tile", "wall-panel", "booth-frame", "elevator-entrance", "stairs", "escalator-entrance"]
    roles = {name: "branding" if "branding" in name else "glass" if "glass" in name else "surface" for name in sorted(materials)}
    metadata = {
        "id": asset_id, "version": 1, "label": asset_id.replace("-", " ").title(),
        "anchor": anchor, "facing": "+Z", "dimensions": dimensions,
        "bounds": {"min": lower, "max": upper},
        "footprint": [[lower[0], lower[2]], [upper[0], lower[2]], [upper[0], upper[2]], [lower[0], upper[2]]],
        "requiredNodes": ["root"] + list(sockets) + (["door_left", "door_right"] if asset_id == "elevator-entrance" else []),
        "materialRoles": roles,
        "sockets": {name: {"position": position, "rotation": [0, 0, 0]} for name, position in sockets.items()},
        "colliders": [{"halfExtents": [value / 2 for value in dimensions], "position": [(lower[i] + upper[i]) / 2 for i in range(3)], "rotation": [0, 0, 0]}],
        "source": {"blend": f"assets-source/blender/{asset_id}/{asset_id}.blend", "recipe": f"assets-source/blender/{asset_id}/build.py", "license": "LicenseRef-Project-Owned", "generatorVersion": VERSION},
        "budget": {"triangles": BUDGETS[asset_id][0], "materials": BUDGETS[asset_id][1], "bytes": 2097152 if structural else 1048576, "textureSize": 2048 if structural else 1024},
        "metrics": {"triangles": triangles, "materials": len(materials), "bytes": output.stat().st_size, "textureBytes": 0},
    }
    if asset_id in ["stairs", "escalator-entrance"]:
        metadata["portalRise"] = 4
    # A booth/elevator needs an entrance gap; collision is composed from its frame pieces.
    if asset_id in ["booth-frame", "elevator-entrance"]:
        metadata["colliders"] = []
        for obj in meshes:
            if obj.name.startswith("mesh_side") or obj.name in ["mesh_rear"] or (asset_id == "elevator-entrance" and obj.name.startswith("mesh_frame")):
                size = obj.dimensions
                center = obj.matrix_world.translation
                metadata["colliders"].append({"halfExtents": [size.x / 2, size.z / 2, size.y / 2], "position": [center.x, center.z, -center.y], "rotation": [0, 0, 0]})
    (META_DIR / f"{asset_id}.v1.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if previews:
        render_previews(asset_id, dimensions)
    print("ASSET_EXPORTED", asset_id, triangles, output.stat().st_size, flush=True)


def render_previews(asset_id, dimensions):
    scene = bpy.context.scene
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
    extent = max(dimensions)
    camera.data.ortho_scale = extent * 1.4
    target = Vector((0, 0, dimensions[1] / 2))
    for view, direction in [("front", (0, -1, .18)), ("side", (1, 0, .18)), ("top", (0, -.01, 1)), ("hero", (1, -1, .85))]:
        camera.location = target + Vector(direction).normalized() * (extent * 3 + 1)
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(PREVIEW_DIR / f"{asset_id}.{view}.png")
        bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["first", "remaining", "all"], default="first")
    parser.add_argument("--asset", choices=list(BUDGETS))
    parser.add_argument("--previews", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    for path in [MODEL_DIR, META_DIR, PREVIEW_DIR]:
        path.mkdir(parents=True, exist_ok=True)
    assets = [args.asset] if args.asset else FIRST if args.stage == "first" else list(BUDGETS) if args.stage == "all" else [key for key in BUDGETS if key not in FIRST]
    for asset_id in assets:
        export_asset(asset_id, args.previews)
    catalog = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(META_DIR.glob("*.v1.json"))]
    (META_DIR / "catalog.v1.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
