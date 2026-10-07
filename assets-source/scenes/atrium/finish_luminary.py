"""Final fleet/arrival composition, validation, exports and reviewed camera renders."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'luminary-galleria.blend'))
s=bpy.context.scene;F=s['parking_floor_z']
for o in s.objects:
    if o.type=='LIGHT':
        o.visible_glossy=False;o.visible_transmission=False

def adjust(name,loc,target,lens):
    o=bpy.data.objects[name];o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.lens=lens
adjust('P1 | Pickup craftsmanship',(20.5,-7.6,F+2.6),(16.9,-13.7,F+.98),36)
adjust('P1 | Utility fleet',(.2,-10.0,F+2.1),(3.8,.3,F+1.0),28)
adjust('P1 | SUV portrait',(18.8,-6.4,F+1.62),(13.6,0,F+.91),43)
# Two stationary arrival vehicles help establish human scale beneath the canopy.
c=bpy.data.collections['LUM | Arrival roads']
for name,bounds in [('LUM ramp arrival apron',(41.3,46.7,15,23)),('LUM ramp ring-road link',(44,52,20,24))]:
    if name not in bpy.data.objects:
        x1,x2,y1,y2=bounds
        me=bpy.data.meshes.new(name);me.from_pydata([(x1,y1,.027),(x2,y1,.027),(x2,y2,.027),(x1,y2,.027)],[],[(0,1,2,3)])
        me.materials.append(bpy.data.materials['P1 / LUM asphalt']);o=bpy.data.objects.new(name,me);c.objects.link(o)
for o in [item for item in c.objects if item.name.startswith('LUM valet vehicle') and item.type=='EMPTY']:
    for child in list(o.children):bpy.data.objects.remove(child,do_unlink=True)
    bpy.data.objects.remove(o,do_unlink=True)
for name,source,pos,angle in [
    ('LUM valet vehicle 01','P1-B10 SUV',(-11,-36.5,.058),math.pi/2),
    ('LUM valet vehicle 02','P1-C02 Sedan',(14,-36.25,.058),math.pi/2)]:
    src=bpy.data.objects[source];root=bpy.data.objects.new(name,None);c.objects.link(root)
    root.location=pos;root.rotation_euler[2]=angle;root['vehicle_class']=src['vehicle_class']
    for part in src.children:
        o=part.copy();o.data=part.data;c.objects.link(o);o.parent=root
        if o.type=='FONT':
            o.data=part.data.copy();o.data.body='LM '+('V01' if name.endswith('01') else 'V02')
s.camera=bpy.data.objects['LUM | Twilight exterior']
s.render.resolution_x=1800;s.render.resolution_y=1200;s.render.resolution_percentage=100
s.cycles.samples=64;s.cycles.adaptive_threshold=.035;s.cycles.use_denoising=True
bpy.context.view_layer.update()
roots=[o for o in s.objects if o.type=='EMPTY' and o.name.startswith('P1-')]
tyres=[o for o in bpy.data.collections['P1 | Vehicles'].objects if 'pneumatic tyre' in o.name]
contacts=[abs(min((o.matrix_world@v.co).z for v in o.data.vertices)-F) for o in tyres]
assert len(roots)==18 and len(tyres)==72 and max(contacts)<.008
assert s['retail_floor_count']==4
assert s['exterior_canopy_projection_m']==18
validation={'retail_floors':4,'garage_vehicles':18,'valet_vehicles':2,'garage_tyre_contacts':72,
            'maximum_tyre_contact_error_m':max(contacts),'parking_bays':31,'free_bays':13,
            'canopy_projection_m':18,'complete_scene':'luminary-galleria.blend'}
(ROOT/'luminary-final-validation.json').write_text(json.dumps(validation,indent=2),encoding='utf-8')
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'luminary-galleria.blend'))
print('LUMINARY_FINAL_VALIDATED '+json.dumps(validation),flush=True)

if '--export' in sys.argv:
    def export(path,objects):
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:
            if o.type!='LIGHT':o.hide_set(False);o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
                                 export_apply=True,export_cameras=True,export_lights=False,
                                 export_animations=False,export_extras=True)
        print('ASSET_EXPORTED '+str(path),flush=True)
    export(ROOT/'luminary-galleria.glb',list(s.objects))
    parking=set()
    for collection in bpy.data.collections:
        if collection.name.startswith('P1 |'):parking.update(collection.objects)
    export(ROOT/'parking-refined.glb',parking)
    assets=ROOT/'vehicles';assets.mkdir(exist_ok=True)
    for filename,name in [('suv','P1-A08 SUV'),('pickup','P1-A11 Pickup'),('utility-van','P1-B08 Utility van'),
                          ('estate-car','P1-A04 Wagon'),('sedan','P1-C11 Sedan'),('electric-car','P1-B03 EV')]:
        root=bpy.data.objects[name];old=root.matrix_world.copy();root.matrix_world=Matrix.Translation((0,0,.005))
        bpy.context.view_layer.update();export(assets/(filename+'.glb'),[root,*root.children])
        root.matrix_world=old
    bpy.context.view_layer.update()
if '--render' in sys.argv or '--preview' in sys.argv:
    preview='--preview' in sys.argv
    views=[('LUM | Twilight exterior','luminary-exterior'),('LUM | Promenade arrival','luminary-promenade'),
           ('LUM | Canopy craftsmanship','luminary-canopy'),('P1 | Cinematic aisle','parking-refined-hero'),
           ('P1 | Pickup craftsmanship','parking-pickup'),('P1 | Utility fleet','parking-utility'),
           ('P1 | SUV portrait','parking-suv'),('P1 | EV detail','parking-refined-ev')]
    if preview:views=[views[0],views[4],views[5]]
    garage_only='--garage-only' in sys.argv
    if garage_only:views=views[3:]
    for name,file in views:
        s.camera=bpy.data.objects[name]
        s.render.resolution_x=1050 if preview else (1600 if garage_only else 1800)
        s.render.resolution_y=700 if preview else (1000 if garage_only else 1200)
        s.cycles.samples=16 if preview else (32 if garage_only else 64);s.cycles.adaptive_threshold=.09 if preview else .035
        s.render.filepath=str(ROOT/(file+('-final-preview' if preview else '')+'.png'))
        bpy.ops.render.render(write_still=True);print('FINAL_VIEW '+file,flush=True)
