import bpy,sys,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root/'atrium-parking-refined.blend'))
s=bpy.context.scene
preview='--preview' in sys.argv
views=[('P1 | Cinematic aisle','parking-refined-hero'),('P1 | Lift lobby','parking-refined-lobby'),('P1 | EV detail','parking-refined-ev'),('P1 | Curved arrival','parking-refined-ramp')]
if preview:views=views[1:]
s.cycles.samples=16 if preview else 48
s.cycles.adaptive_threshold=.09 if preview else .035
s.render.resolution_x=960 if preview else 1600
s.render.resolution_y=600 if preview else 1000
for name,filename in views:
 s.camera=bpy.data.objects[name]
 s.render.filepath=str(root/(filename+('-preview' if preview else '')+'.png'))
 bpy.ops.render.render(write_still=True)
 print('VIEW_COMPLETE '+filename,flush=True)
print('P1_VIEWS_COMPLETE',flush=True)
