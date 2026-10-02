"""Inspect editable sources in an isolated headless Blender process, without saving."""
import json
from pathlib import Path
import bpy
from mathutils import Vector

project = Path(__file__).resolve().parents[2]
catalog = json.loads((project / "src/frontend/assets/metadata/catalog.v1.json").read_text(encoding="utf-8"))
reports = []
for asset in catalog:
    variants = [("baseline", asset["source"])] + [(name, value["source"]) for name, value in asset.get("variants", {}).items()]
    for quality, source in variants:
        bpy.ops.wm.open_mainfile(filepath=str(project / source["blend"]))
        bpy.context.view_layer.update()
        root = bpy.data.objects.get("root")
        errors = []
        if not root or any(abs(value) > 1e-6 for value in root.location) or any(abs(value - 1) > 1e-6 for value in root.scale) or any(abs(value) > 1e-6 for value in root.rotation_euler):
            errors.append("Non-neutral root")
        if source["generatorVersion"] == "1.1.0" and root and (root.get("asset_id") != asset["id"] or root.get("asset_version") != asset["version"] or root.get("generator_version") != source["generatorVersion"] or root.get("quality_variant") != quality):
            errors.append("Source version/quality mismatch")
        if bpy.context.scene.unit_settings.system != "METRIC" or bpy.context.scene.unit_settings.scale_length != 1:
            errors.append("Source units are not meters")
        for name in asset["requiredNodes"]:
            if name not in bpy.data.objects:
                errors.append("Missing node: " + name)
        for name, attachment in asset["sockets"].items():
            obj = bpy.data.objects.get(name)
            if obj:
                point = obj.matrix_world.translation
                world = [point.x, point.z, -point.y]
                if any(abs(a - b) > .005 for a, b in zip(world, attachment["position"])):
                    errors.append("Socket mismatch: " + name)
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        triangles = 0
        for obj in meshes:
            if obj.data.validate(verbose=False):
                errors.append("Invalid source mesh: " + obj.name)
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
        expected = asset["metrics"] if quality == "baseline" else asset["variants"][quality]["metrics"]
        if triangles != expected["triangles"]:
            errors.append("Source/export triangle mismatch")
        points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
        lower = [min(p.x for p in points), min(p.z for p in points), -max(p.y for p in points)]
        upper = [max(p.x for p in points), max(p.z for p in points), -min(p.y for p in points)]
        if any(abs(a - b) > .005 for a, b in zip(lower + upper, asset["bounds"]["min"] + asset["bounds"]["max"])):
            errors.append("Source bounds disagree with release")
        reports.append({"id": asset["id"], "quality": quality, "blender": bpy.app.version_string, "triangles": triangles, "errors": errors})
(project / "reports/assets/source-validation.json").write_text(json.dumps({"sources": reports}, indent=2) + "\n", encoding="utf-8")
failures = [report for report in reports if report["errors"]]
if failures:
    raise RuntimeError(json.dumps(failures))
print("VALIDATED_EDITABLE_SOURCES", len(reports), flush=True)

bpy.ops.wm.open_mainfile(filepath=str(project / "assets-source/blender/calibration.blend"))
if bpy.context.scene.unit_settings.system != "METRIC" or bpy.context.scene.unit_settings.scale_length != 1:
    raise RuntimeError("Calibration units mismatch")
if any(abs(a-b) > .005 for a,b in zip(bpy.data.objects["meter_cube"].dimensions, [1,1,1])):
    raise RuntimeError("Calibration cube mismatch")
bpy.ops.wm.open_mainfile(filepath=str(project / "assets-source/blender/materials.blend"))
material_names = sorted(material.name for material in bpy.data.materials)
if not material_names or any(not material.use_nodes or not material.use_fake_user for material in bpy.data.materials):
    raise RuntimeError("Material library is incomplete")
(project / "reports/assets/authoring-calibration.json").write_text(json.dumps({"passed": True, "blender": bpy.app.version_string, "unitScale": 1, "meterCubeDimensions": [1,1,1], "materials": material_names}, indent=2) + "\n", encoding="utf-8")
