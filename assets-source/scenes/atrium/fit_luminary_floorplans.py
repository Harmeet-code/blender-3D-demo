"""Calibrated metre-scale venue scene and modular browser shells.
The original four-floor mall, garage, vehicles and cameras stay in their original scene.
Run after scripts/assets/prepare-luminary-plan.py, using Blender 4.5 background mode.
"""
import bpy, json, math, shutil, sys
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
PUBLIC=ROOT/'public'/'floor-assets'
TARGET=HERE/'luminary-galleria.blend'
BACKUP=HERE/'backups'/'luminary-galleria-before-floorplans.blend'
BACKUP.parent.mkdir(exist_ok=True)
if not BACKUP.exists(): shutil.copy2(TARGET,BACKUP)
bpy.ops.wm.open_mainfile(filepath=str(TARGET))
layout=json.loads((PUBLIC/'luminary-metres.json').read_text(encoding='utf-8'))
old=bpy.data.scenes.get('Luminary | original four-floor mall') or bpy.context.scene
if not old.name.startswith('Luminary |'): old.name='Luminary | original four-floor mall'
# Rerunning only replaces this generator's scene, never the original source scene.
existing=bpy.data.scenes.get('Luminary | calibrated floor plans')
if existing:
    bpy.data.scenes.remove(existing)
    for collection in list(bpy.data.collections):
        if collection.name.startswith('PLAN |'):
            for obj in list(collection.objects): bpy.data.objects.remove(obj,do_unlink=True)
            bpy.data.collections.remove(collection)
scene=bpy.data.scenes.new('Luminary | calibrated floor plans')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene['metres_per_foot']=.3048
scene['SW13_dimensions_m']=[9.144,9.144]
scene['original_retail_floors']=4
scene['floor_1_map_dimensions_m']=[531.637875,318.7065]
scene['floor_2_layout']='Provisional Arena crop for owner authoring; no placed booths'
scene['original_scene']=old.name
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('PLAN | warm dusk sky');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.28,.36,.52,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65

def material(name,color,rough=.5,metal=0):
    mat=bpy.data.materials.get('PLAN / '+name) or bpy.data.materials.new('PLAN / '+name)
    mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return mat
stone=material('honed ivory limestone',(.66,.62,.54),.65)
brass=material('satin champagne bronze',(.48,.32,.15),.32,.78)
dark=material('architectural graphite',(.045,.055,.065),.48,.4)
wood=material('warm natural oak',(.36,.18,.075),.55)
white=material('booth warm white',(.8,.79,.74),.6)
glass=material('clear edge glass',(.64,.79,.82),.1)
glass.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.8
glass.diffuse_color=(.64,.79,.82,.18)
glow=material('warm integrated light',(.9,.63,.3),.35)
gp=glow.node_tree.nodes['Principled BSDF'];gp.inputs['Emission Color'].default_value=(1,.57,.2,1);gp.inputs['Emission Strength'].default_value=3

def collection(name):
    c=bpy.data.collections.new('PLAN | '+name);scene.collection.children.link(c);return c
def mesh(name,vertices,faces,mat,c):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.materials.append(mat)
    obj=bpy.data.objects.new(name,data);c.objects.link(obj);return obj
def box(name,pos,size,mat,c,bevel=0):
    x,y,z=pos;w,d,h=[n/2 for n in size]
    vertices=[(x+sx*w,y+sy*d,z+sz*h) for sz in [-1,1] for sy in [-1,1] for sx in [-1,1]]
    obj=mesh(name,vertices,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],mat,c)
    if bevel:
        mod=obj.modifiers.new('fine edge highlights','BEVEL');mod.width=bevel;mod.segments=2
    return obj
def coords(point):return point[0],-point[1]
def camera(name,position,target,lens=45):
    data=bpy.data.cameras.new(name);obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    obj.location=position;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();data.lens=lens;data.clip_end=5000;return obj

validation=[]
for floor in layout['floors']:
    fid=floor['id'];height=floor['heightOffset'];bounds=floor['authoring']['boundary']
    xs=[p[0] for p in bounds];ys=[-p[1] for p in bounds];x0,x1=min(xs),max(xs);y0,y1=min(ys),max(ys)
    cx,cy=(x0+x1)/2,(y0+y1)/2;w,d=x1-x0,y1-y0
    shell=collection(fid+' architectural shell')
    # Export shells at local floor height zero. Browser supplies each floor's elevation.
    slab=box(fid+' calibrated foundation',(cx,cy,-.16),(w,d,.3),stone,shell,.04)
    for y in [y0,y1]:box(fid+' bronze perimeter reveal',(cx,y,-.04),(w,.12,.08),brass,shell,.015)
    for x in [x0,x1]:box(fid+' bronze perimeter reveal',(x,cy,-.04),(.12,d,.08),brass,shell,.015)
    if fid=='F2':
        # Human-scale balustrades and columns; geometry is never scaled with the map.
        for x in [x0-.3,x1+.3]:
            for i in range(int(d/8)+1):
                y=y0+i*d/max(1,int(d/8))
                box(fid+' bronze mullion',(x,y,.56),(.07,.07,1.12),brass,shell,.008)
            box(fid+' glass balustrade',(x,cy,.58),(.025,d,1.06),glass,shell)
            box(fid+' timber handrail',(x,cy,1.14),(.09,d,.07),wood,shell,.015)
        for y in [y0-.3,y1+.3]:
            box(fid+' glass balustrade',(cx,y,.58),(w,.025,1.06),glass,shell)
            box(fid+' timber handrail',(cx,y,1.14),(w,.09,.07),wood,shell,.015)
        for x in [x0-.5,x1+.5]:
            for i in range(9):
                y=y0+i*d/8
                box(fid+' structural column',(x,y,1.8),(.4,.4,3.6),dark,shell,.02)
                box(fid+' column uplight',(x,y,.15),(.44,.44,.06),glow,shell,.01)
        for y in [y0-.6,y1+.6]:
            box(fid+' floating fascia',(cx,y,3.5),(w+1.6,.6,.18),stone,shell,.04)
            box(fid+' continuous warm soffit',(cx,y,3.39),(w+1.6,.05,.04),glow,shell)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in shell.objects:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/f'luminary-{fid.lower()}-shell.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
    # Move the native shell to its real floor level after the browser export.
    for obj in shell.objects:obj.location.z+=height
    plan=collection(fid+' reference image')
    image=bpy.data.images.load(str(PUBLIC/('denver-floor-1.webp' if fid=='F1' else 'denver-floor-2.webp')),check_existing=True)
    image.pack()
    mat=material(fid+' map underlay',(.9,.9,.9),.85)
    nodes=mat.node_tree.nodes;texture=nodes.new('ShaderNodeTexImage');texture.image=image
    mat.node_tree.links.new(texture.outputs['Color'],nodes['Principled BSDF'].inputs['Base Color'])
    plane=mesh(fid+' calibrated map',[(x0,y1,height+.002),(x1,y1,height+.002),(x1,y0,height+.002),(x0,y0,height+.002)],[(0,3,2,1)],mat,plan)
    uv=plane.data.uv_layers.new(name='Plan pixels');uvpoints=[(0,1),(1,1),(1,0),(0,0)]
    for loop in plane.data.loops:uv.data[loop.index].uv=uvpoints[loop.vertex_index]
    booths=collection(fid+' exact booth footprints')
    for room in [r for r in layout['rooms'] if r['floorId']==fid]:
        px=[p[0] for p in room['polygon']];py=[-p[1] for p in room['polygon']]
        bx0,bx1=min(px),max(px);by0,by1=min(py),max(py);bw,bd=bx1-bx0,by1-by0;bcx,bcy=(bx0+bx1)/2,(by0+by1)/2
        root=bpy.data.objects.new(room['id']+' | exact footprint',None);booths.objects.link(root)
        root['dimensions_feet']=room['dimensionsFeet'];root['dimensions_metres']=[bw,bd];root['floor_id']=fid
        floorplate=box(room['id']+' floor surface',(bcx,bcy,height+.012),(bw,bd,.02),wood,booths)
        floorplate.parent=root
        # Walls sit INSIDE the authored footprint, preserving its exact outer width/depth.
        for x in [bx0+.04,bx1-.04]:box(room['id']+' side wall',(x,bcy,height+1.3),(.08,bd,2.6),white,booths,.015).parent=root
        box(room['id']+' rear wall',(bcx,by1-.04,height+1.3),(bw,.08,2.6),white,booths,.015).parent=root
        for x in [bx0+.035,bx1-.035]:box(room['id']+' bronze entry stile',(x,by0+.035,height+1.3),(.07,.07,2.6),brass,booths,.008).parent=root
        box(room['id']+' header',(bcx,by0+.06,height+2.52),(bw,.12,.16),dark,booths,.015).parent=root
        box(room['id']+' concealed light',(bcx,by1-.1,height+2.42),(max(.1,bw-.3),.03,.03),glow,booths).parent=root
        assert abs(bw-room['dimensionsFeet'][0]*.3048)<1e-8
        assert abs(bd-room['dimensionsFeet'][1]*.3048)<1e-8
        validation.append({'booth':room['id'],'feet':room['dimensionsFeet'],'metres':[bw,bd],'maximum_dimension_error_m':max(abs(bw-room['dimensionsFeet'][0]*.3048),abs(bd-room['dimensionsFeet'][1]*.3048))})
    print('FLOOR_EXPORTED '+fid,flush=True)

lights=collection('cinematic light')
sun=bpy.data.lights.new('PLAN late-afternoon sun','SUN');sun.energy=2.2;sun.angle=.15
obj=bpy.data.objects.new(sun.name,sun);lights.objects.link(obj);obj.rotation_euler=(.45,-.5,-.3)
scene.camera=camera('PLAN | full calibrated venue',(430,-510,460),(0,0,0),48)
cx=(1311-11163/2)*.047625;cy=-(5749-6692/2)*.047625
detail=camera('PLAN | SW13 calibration reference',(cx+15,cy-21,11),(cx,cy,1),48)
arena=layout['floors'][1]['authoring']['boundary'];ax=sum(p[0] for p in arena)/4;ay=-sum(p[1] for p in arena)/4
camera('PLAN | arena mezzanine',(ax+80,ay-70,70),(ax,ay,4.4),45)
(HERE/'floorplan-fit-validation.json').write_text(json.dumps({'metres_per_foot':.3048,'original_scene_preserved':old.name,'original_scene_objects':len(old.objects),'calibrated_scene':scene.name,'booths':validation,'shells':[f'luminary-{f["id"].lower()}-shell.glb' for f in layout['floors']]},indent=2),encoding='utf-8')
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(TARGET))
if '--render' in sys.argv:
    scene.camera=detail;scene.render.filepath=str(HERE/'luminary-sw13-calibrated.png');bpy.ops.render.render(write_still=True)
    scene.camera=bpy.data.objects['PLAN | arena mezzanine'];scene.render.filepath=str(HERE/'luminary-floor-2-calibrated.png');bpy.ops.render.render(write_still=True)
print('CALIBRATED_VENUE_COMPLETE '+json.dumps({'SW13':[9.144,9.144],'booths':len(validation)}),flush=True)
