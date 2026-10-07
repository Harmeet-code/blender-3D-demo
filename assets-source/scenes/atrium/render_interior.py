from pathlib import Path
import bpy
from mathutils import Vector
root=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root/"atrium.blend"))
s=bpy.context.scene
s.camera=bpy.data.objects["Interior promenade"]
s.camera.location=(0,-12.5,2.2)
s.camera.rotation_euler=(Vector((0,4,7.4))-s.camera.location).to_track_quat('-Z','Y').to_euler()
s.camera.data.lens=22
s.camera.data.clip_start=.1
s.camera=bpy.data.objects["Architectural hero camera"]
bpy.ops.wm.save_as_mainfile(filepath=str(root/"atrium.blend"))
s.camera=bpy.data.objects["Interior promenade"]
s.render.resolution_x=1000
s.render.resolution_y=625
s.eevee.taa_render_samples=16
s.render.filepath=str(root/"atrium-interior.png")
bpy.ops.render.render(write_still=True)
print("ATRIUM_INTERIOR_COMPLETE")
