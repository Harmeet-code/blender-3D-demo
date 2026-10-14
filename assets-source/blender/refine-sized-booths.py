"""Refine the existing project-owned booth-frame source into exact-size, independent artifacts.
No booths are placed on a venue floor. Blender/GLB units are metres; +Z is the GLB entrance.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'assets-source/blender/booth-frame/booth-frame.blend'
OUT=ROOT/'assets-source/blender/booths'
WEB=ROOT/'public/floor-assets/booths'
OUT.mkdir(exist_ok=True);WEB.mkdir(parents=True,exist_ok=True)
SIZES=[(10,10),(28,10),(28,36),(28,54),(27,50),(20,20),(14,38),(40,45)]
catalog=[]
def material(name,color,rough=.5,metal=0,emit=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if emit:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
    return m
def bevel(obj,width=.004):
    mod=obj.modifiers.new('crafted edge radius','BEVEL');mod.width=width;mod.segments=2
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=obj.modifiers.new('weighted flat face normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
def fit(obj,size,pos,mat):
    obj.location=(pos[0],-pos[2],pos[1]);obj.dimensions=(size[0],size[2],size[1])
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.select_set(False)
    obj.data.materials.clear();obj.data.materials.append(mat);bevel(obj)
def box(root,name,size,pos,mat,radius=.003):
    x,y,z=pos;w,h,d=[n/2 for n in size]
    # Input and metadata use browser X/Y/Z. Native Blender uses X/-Z/Y.
    vertices=[(x+sx*w,-(z+sz*d),y+sy*h) for sy in [-1,1] for sz in [-1,1] for sx in [-1,1]]
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]);data.materials.append(mat)
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.parent=root
    # Ensure outward normals even under X/-Z/Y handedness conversion.
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');obj.select_set(False)
    if radius:bevel(obj,radius)
    return obj

for wf,df in SIZES:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene.name=f'Luminary booth | {wf} x {df} feet'
    root=bpy.data.objects['root'];root['dimensions_feet']=[wf,df];root['metres_per_foot']=.3048;root['source_parent']=str(SOURCE.relative_to(ROOT));root['generator_version']='2.0.0'
    W,D,H=wf*.3048,df*.3048,2.8
    root['dimensions_metres']=[W,H,D]
    panel=material('finish_panel',(.78,.76,.70),.66)
    graphite=material('finish_branding',(.035,.048,.057),.32,.35)
    bronze=material('booth_satin_bronze',(.48,.32,.16),.32,.82)
    oak=material('booth_natural_oak',(.35,.19,.095),.58)
    stone=material('booth_honed_stone',(.47,.45,.4),.7)
    light=material('booth_warm_led',(.98,.67,.36),.35,0,3)
    for obj in scene.objects:obj.select_set(False)
    fit(bpy.data.objects['mesh_rear'],(W,H,.08),(0,H/2,-D/2+.04),panel)
    for sign in [-1,1]:fit(bpy.data.objects[f'mesh_side_{sign}'],(.08,H,D-.08),(sign*(W/2-.04),H/2,.04),panel)
    fit(bpy.data.objects['mesh_branding'],(W,.22,.1),(0,H-.11,D/2-.05),graphite)
    bpy.data.objects['socket_entry'].location=(0,-D/2,0)
    bpy.data.objects['socket_branding'].location=(0,-D/2,H-.11)
    # Ground contact and exact outer footprint. Every decorative part stays within it.
    box(root,'inset_oak_floor',(W,.024,D),(0,.012,0),oak,.001)
    for sign in [-1,1]:
        x=sign*(W/2-.09)
        box(root,f'bronze_entry_post_{sign}',(.055,H,.055),(x,H/2,D/2-.065),bronze,.004)
        box(root,f'oak_side_plinth_{sign}',(.025,.14,D-.22),(sign*(W/2-.0925),.095,.015),oak,.002)
        box(root,f'warm_side_wash_{sign}',(.025,.018,D-.28),(sign*(W/2-.1),H-.35,0),light,.001)
        # A regular physical pitch preserves detail when booths become longer.
        bays=max(1,math.ceil((D-.2)/1.2))
        for i in range(1,bays):
            z=-D/2+.12+i*(D-.24)/bays
            box(root,f'panel_side_reveal_{sign}_{i}',(.008,H-.27,.012),(sign*(W/2-.085),H/2,z),bronze,0)
    box(root,'rear_oak_plinth',(W-.2,.14,.025),(0,.095,-D/2+.0925),oak,.002)
    box(root,'rear_light_wash',(W-.22,.018,.026),(0,H-.35,-D/2+.1),light,.001)
    box(root,'entry_shadow_reveal',(W-.14,.018,.014),(0,H-.235,D/2-.05),bronze,.001)
    # Minimal timber accent, with individually modelled slats and fine shadow gaps.
    accent=min(W-.35,1.8)
    count=max(3,int(accent/.085));pitch=accent/count
    for i in range(count):
        box(root,f'oak_accent_slat_{i}',(pitch-.018,H-.58,.022),(-accent/2+pitch*(i+.5),H/2+.05,-D/2+.095),oak,.002)
    # Subtle removable branding text, rather than a dimension label in the finished scene.
    data=bpy.data.curves.new('editable_exhibitor_name','FONT');data.body='LUMINARY';data.align_x='CENTER';data.align_y='CENTER';data.size=.14;data.extrude=.0005;data.materials.append(bronze)
    label=bpy.data.objects.new('exhibitor_name',data);scene.collection.objects.link(label);label.parent=root
    label.location=(0,-D/2+.006,H-.11);label.rotation_euler=(math.pi/2,0,0)
    bpy.context.view_layer.objects.active=label;label.select_set(True);bpy.ops.object.convert(target='MESH');label.select_set(False)
    bpy.context.view_layer.update()
    objects=[root,*root.children_recursive];meshes=[o for o in objects if o.type=='MESH']
    points=[o.matrix_world@Vector(corner) for o in meshes for corner in o.bound_box]
    native_min=[min(p[i] for p in points) for i in range(3)];native_max=[max(p[i] for p in points) for i in range(3)]
    measured=[native_max[0]-native_min[0],native_max[2]-native_min[2],native_max[1]-native_min[1]]
    error=max(abs(a-b) for a,b in zip(measured,[W,H,D]));assert error<.0001,(wf,df,error,measured)
    assert abs(native_min[2])<.00001
    directory=OUT/f'{wf}x{df}';directory.mkdir(exist_ok=True)
    filename=f'booth-{wf}x{df}'
    for obj in scene.objects:obj.select_set(False)
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    glb=WEB/(filename+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_extras=True)
    triangles=0
    for obj in meshes:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    metadata={'id':filename,'label':f'{wf} × {df} ft booth','dimensionsFeet':[wf,df],'dimensionsMetres':[W,H,D],'measuredDimensionsMetres':measured,'maximumDimensionErrorMetres':error,'anchor':'floor-contact','facing':'+Z','url':f'/floor-assets/booths/{filename}.glb','preview':f'/floor-assets/booths/{filename}.png','source':str((directory/(filename+'.blend')).relative_to(ROOT)),'sourceParent':str(SOURCE.relative_to(ROOT)),'triangles':triangles,'bytes':glb.stat().st_size,'colliders':[{'halfExtents':[W/2,H/2,.04],'position':[0,H/2,-D/2+.04]},*({'halfExtents':[.04,H/2,(D-.08)/2],'position':[sign*(W/2-.04),H/2,.04]} for sign in [-1,1])]}
    (directory/'metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8');catalog.append(metadata)
    # Native source includes an intentionally separate photographic setup.
    studio=bpy.data.collections.new('STUDIO | preview only');scene.collection.children.link(studio)
    floor=box(None,'STUDIO backdrop',(max(W,D)*6,.04,max(W,D)*6),(0,-.03,0),material('studio_sand',(.43,.43,.4),.85),.001)
    for c in list(floor.users_collection):c.objects.unlink(floor)
    studio.objects.link(floor)
    world=bpy.data.worlds.new('STUDIO overcast warm dusk');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.5,.59,.72,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55;scene.world=world
    for name,pos,energy,color,size in [('key',(-W,-D,H+max(W,D)),220*W*D,(1,.85,.68),max(W,D)),('fill',(W*.8,-D*.3,H+4),65*W*D,(.69,.81,1),max(W,D)*.8)]:
        data=bpy.data.lights.new('STUDIO '+name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(data.name,data);studio.objects.link(obj);obj.location=pos;obj.rotation_euler=(Vector((0,0,H/2))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('STUDIO Hero');cam=bpy.data.objects.new('STUDIO Hero',data);studio.objects.link(cam)
    span=max(W,D);cam.location=(span*.9,-span*1.35,span*.7+1.5);cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=span*1.8;scene.camera=cam
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=1050;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    bpy.ops.wm.save_as_mainfile(filepath=str(directory/(filename+'.blend')))
    if '--render' in sys.argv:scene.render.filepath=str(WEB/(filename+'.png'));bpy.ops.render.render(write_still=True)
    print('SIZED_BOOTH_READY '+json.dumps(metadata),flush=True)
(ROOT/'src/assets/metadata/booth-sizes.v1.json').write_text(json.dumps(catalog,indent=2),encoding='utf-8')
(OUT/'validation.json').write_text(json.dumps({'metres_per_foot':.3048,'count':len(catalog),'booths':catalog},indent=2),encoding='utf-8')
print('BOOTH_LIBRARY_COMPLETE '+str(len(catalog)),flush=True)
