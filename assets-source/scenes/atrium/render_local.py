"""Build and render the ATRIUM presentation using the project's portable Blender."""
from pathlib import Path
import bpy
root = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
namespace = {"__name__": "__main__"}
source = (root / "build_atrium.py").read_text(encoding="utf-8")
try:
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    engine = "BLENDER_EEVEE"
except TypeError:
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    engine = "BLENDER_EEVEE_NEXT"
source = source.replace("s.render.engine='BLENDER_EEVEE'", "s.render.engine=" + repr(engine))
exec(compile(source, str(root / "build_atrium.py"), "exec"), namespace)
exec(compile((root / "finish_atrium.py").read_text(encoding="utf-8"), "finish_atrium.py", "exec"), namespace)
exec(compile((root / "correct_normals.py").read_text(encoding="utf-8"), "correct_normals.py", "exec"), namespace)
s = bpy.context.scene
s.render.resolution_x = 1200
s.render.resolution_y = 960
s.render.resolution_percentage = 100
s.render.image_settings.file_format = "PNG"
if hasattr(s, "eevee") and hasattr(s.eevee, "taa_render_samples"):
    s.eevee.taa_render_samples = 32
bpy.ops.wm.save_as_mainfile(filepath=str(root / "atrium.blend"))
s.render.filepath = str(root / "atrium-hero.png")
bpy.ops.render.render(write_still=True)
s.camera = bpy.data.objects["B1 parking"]
s.render.resolution_y = 760
s.render.filepath = str(root / "atrium-parking.png")
bpy.ops.render.render(write_still=True)
print("ATRIUM_RENDER_COMPLETE")
