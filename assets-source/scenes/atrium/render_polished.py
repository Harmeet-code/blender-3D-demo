from pathlib import Path
import bpy
root = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root / "atrium.blend"))
exec(compile((root / "polish_atrium.py").read_text(encoding="utf-8"), "polish_atrium.py", "exec"))
s=bpy.context.scene
s.render.resolution_x=1440
s.render.resolution_y=1152
s.eevee.taa_render_samples=64
bpy.ops.wm.save_as_mainfile(filepath=str(root / "atrium.blend"))
s.render.filepath=str(root / "atrium-hero.png")
bpy.ops.render.render(write_still=True)
s.camera=bpy.data.objects["B1 parking"]
s.render.resolution_x=1440
s.render.resolution_y=900
s.render.filepath=str(root / "atrium-parking.png")
bpy.ops.render.render(write_still=True)
s.camera=bpy.data.objects["Interior promenade"]
s.render.resolution_x=1000
s.render.resolution_y=625
s.eevee.taa_render_samples=16
s.render.filepath=str(root / "atrium-interior.png")
bpy.ops.render.render(write_still=True)
print("ATRIUM_POLISH_RENDER_COMPLETE")
