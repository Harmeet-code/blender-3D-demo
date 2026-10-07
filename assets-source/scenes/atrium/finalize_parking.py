"""Apply reviewed refinements, validate contacts, save and export parking geometry."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root/'atrium-parking-refined.blend'))
s=bpy.context.scene
s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
bpy.data.objects['Pedestrian route floor legend'].rotation_euler=(0,0,0)
for o in s.objects:
 if o.type=='FONT' and 'EV Charging Zone' in o.data.body:
  o.data.body=o.data.body.replace('↵','←')
for name in ['Connected charging cable','Extinguisher hose']:
 o=bpy.data.objects[name]
 old=o.data.splines[0]
 if old.type=='BEZIER':continue
 points=[tuple(p.co[:3]) for p in old.points]
 o.data.splines.remove(old)
 sp=o.data.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for p,co in zip(sp.bezier_points,points):
  p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
s.camera=bpy.data.objects['P1 | Cinematic aisle']
s.render.resolution_x=1600;s.render.resolution_y=1000
s.cycles.samples=48;s.cycles.adaptive_threshold=.035
s.frame_set(36);bpy.context.view_layer.update()
F=s['parking_floor_z']
roots=[o for o in s.objects if o.type=='EMPTY' and o.name.startswith('P1-')]
statuses=[o for o in s.objects if o.name.startswith('Bay status ')]
tyres=[o for o in s.objects if 'pneumatic tyre' in o.name]
contact_errors=[]
for o in tyres:
 minimum=min((o.matrix_world@v.co).z for v in o.data.vertices)
 if abs(minimum-F)>.012:contact_errors.append({'object':o.name,'clearance':minimum-F})
assert len(roots)==18, len(roots)
assert len(statuses)==31, len(statuses)
assert len(tyres)==72, len(tyres)
assert not contact_errors, contact_errors
assert s.get('retail_floor_count')==4
for name in ['P1-A08 SUV','P1-B03 EV','P1-C11 Sedan','Protected teal pedestrian approach','Connected charging cable','Payment touch display','Manual fire alarm pull station','Sweeping curved concrete ramp','Large P1 wall landmark']:
 assert name in bpy.data.objects, name
validation={'retail_floors_retained':4,'parking_bays':len(statuses),'parked_vehicles':len(roots),'tyres_checked':len(tyres),'wheel_contact_errors':contact_errors,'motorcycles':4,'bicycles':2,'frame':s.frame_current,'render_engine':s.render.engine}
(root/'parking-validation.json').write_text(json.dumps(validation,indent=2),encoding='utf-8')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(root/'atrium-parking-refined.blend'))
print('P1_VALIDATED '+json.dumps(validation),flush=True)
bpy.ops.object.select_all(action='DESELECT')
for c in bpy.data.collections:
 if c.name.startswith('P1 |'):
  for o in c.objects:
   if o.type!='LIGHT':o.hide_set(False);o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(root/'parking-refined.glb'),export_format='GLB',use_selection=True,export_apply=True,export_cameras=True,export_lights=False,export_animations=False,export_extras=True)
print('P1_EXPORT_COMPLETE',flush=True)
