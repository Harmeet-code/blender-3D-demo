"""Create isolated authoring calibration and shared PBR library files."""
import runpy
from pathlib import Path
import bpy

source = Path(__file__).resolve().parent
kit = runpy.run_path(str(source / "build.py"))
bpy.ops.wm.read_factory_settings(use_empty=True)
root = bpy.data.objects.new("root", None)
bpy.context.collection.objects.link(root)
kit["box"](root, "meter_cube", (1, 1, 1), (0, .5, 0), "branding")
kit["socket"](root, "front_positive_z", (0, 0, 1))
bpy.ops.wm.save_as_mainfile(filepath=str(source / "calibration.blend"))
bpy.ops.export_scene.gltf(filepath=str(source / "calibration.glb"), export_format="GLB", export_yup=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
for name in kit["COLORS"]:
    finish = kit["material"](name)
    finish.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=str(source / "materials.blend"))
