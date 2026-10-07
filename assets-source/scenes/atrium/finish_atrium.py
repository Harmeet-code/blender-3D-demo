import bpy, math, random
from mathutils import Vector
random.seed(19)
s=bpy.context.scene
def mat(name,color,rough=.45,metal=0,emit=0):
 m=bpy.data.materials.get(name)
 if m:return m
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
 if emit: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emit
 return m
stone=mat('Warm honed limestone',(.63,.56,.43),.36)
edge=mat('Ivory terrazzo edges',(.86,.8,.67),.3)
oak=mat('Smoked oak',(.22,.095,.035),.39)
bronze=mat('Brushed champagne bronze',(.43,.28,.12),.27,.75)
dark=mat('Charcoal metal',(.035,.045,.052),.3,.6)
glass=mat('Blue smoke architectural glass',(.16,.3,.32),.18,.28)
p=next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); p.inputs['Transmission Weight'].default_value=.32
warm=mat('2700K integrated lighting',(1,.57,.2),.3,0,4)
white=mat('Warm white lettering',(.96,.92,.78),.35,0,.6)
concrete=mat('Basement microcement',(.16,.2,.21),.65)
teal=mat('Parking sage wayfinding',(.055,.32,.3),.5)
green=mat('Olive foliage',(.1,.2,.065),.65)
fabric=mat('Sand boucle upholstery',(.72,.65,.5),.8)
clay=mat('Terracotta upholstery',(.46,.18,.095),.7)
soil=mat('Planter earth',(.035,.028,.018),.95)
def box(name,loc,dim,ma,bevel=0):
 x,y,z=[v/2 for v in dim]
 mesh=bpy.data.meshes.new(name); mesh.from_pydata([(-x,-y,-z),(-x,-y,z),(-x,y,-z),(-x,y,z),(x,-y,-z),(x,-y,z),(x,y,-z),(x,y,z)],[],[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]);mesh.update()
 o=bpy.data.objects.new(name,mesh); s.collection.objects.link(o); o.location=loc; o.data.materials.append(ma)
 if bevel: mod=o.modifiers.new('Crafted eased edges','BEVEL');mod.width=bevel;mod.segments=3;mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def cyl(name,loc,r,depth,ma,vertices=24):
 key=(vertices,ma.name)
 if not hasattr(cyl,'cache'):cyl.cache={}
 mesh=cyl.cache.get(key)
 if mesh is None:
  mesh=bpy.data.meshes.new('Shared cylinder '+ma.name)
  verts=[(math.cos(i*2*math.pi/vertices),math.sin(i*2*math.pi/vertices),z) for z in [-.5,.5] for i in range(vertices)]
  faces=[tuple(reversed(range(vertices))),tuple(range(vertices,vertices*2))]
  faces += [(i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices)]
  mesh.from_pydata(verts,[],faces);mesh.materials.append(ma);mesh.update()
  for p in mesh.polygons:p.use_smooth=len(p.vertices)==4
  cyl.cache[key]=mesh
 o=bpy.data.objects.new(name,mesh);s.collection.objects.link(o);o.location=loc;o.scale=(r,r,depth);return o
def line(name,a,b,r,ma):
 o=cyl(name,(Vector(a)+Vector(b))/2,r,(Vector(b)-Vector(a)).length,ma,12);o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler();return o
def text(name,body,loc,size,ma):
 cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.size=size;cu.align_x='CENTER';cu.extrude=.008;cu.bevel_depth=.002
 o=bpy.data.objects.new(name,cu);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(math.pi/2,0,0);cu.materials.append(ma);return o
def light(name,loc,power,color,kind='POINT',target=None,size=1):
 d=bpy.data.lights.new(name,kind);d.energy=power;d.color=color;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc
 if kind=='AREA': d.shape='DISK';d.size=size
 if kind=='POINT': d.shadow_soft_size=size
 if target:o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
 return o

# Circulation bridges connect both gallery wings to every escalator landing.
for level in range(1,4):
 z=level*4.4
 box('Escalator transfer bridge',(0,-6.45,z-.2),(16,1.5,.36),stone,.06)
 box('Transfer bridge front glazing',(0,-7.19,z+.62),(16,.04,1.2),glass,.01)
 box('Transfer bridge bronze cap',(0,-7.19,z+1.24),(16,.065,.065),bronze,.015)
 box('Transfer bridge luminous edge',(0,-7.22,z-.1),(16,.06,.045),warm)
box('Skylight front support',(0,-10.85,17.55),(32.5,.28,.32),edge,.065)
# Correct ramp length in slope plane; road terminates at ground and B1.
r=bpy.data.objects.get('Vehicle ramp into B1');r.location.z=-2.12
# Open the lower inner parapet so cars can turn into the parking aisle.
for o in list(bpy.data.objects):
 if o.name.startswith('Ramp edge parapet') and o.location.x<18:
  o.scale.y=.67;o.location.y=3.4;o.location.z=-1.04
# Match portable lighting to rendered atmosphere.
light('Portable soft cool fill',(5,-18,18),1100,(.56,.7,1),size=5)
light('Portable warm atrium fill',(-7,-4,17),900,(1,.77,.48),size=4)
for level in range(4):
 for x in [-12,12]:
  light('Promenade warm pool',(x,-7,level*4.4+3.4),150,(1,.74,.48),size=1.3)
# Semantic collections for editable handoff.
groups={name:bpy.data.collections.new(name) for name in ['01 Architecture','02 Furniture and planting','03 Retail','04 Escalators','05 Parking','06 Lighting and cameras','07 Presentation']}
for c in groups.values():s.collection.children.link(c)
for o in list(s.objects):
 n=o.name.lower()
 if o.type in {'LIGHT','CAMERA'}:g='06 Lighting and cameras'
 elif any(k in n for k in ['car ','parking','b1 ','ramp','ev ','tire','wheel','lane dash','sprinkler','basement linear']):g='05 Parking'
 elif any(k in n for k in ['escalator','tread','transfer bridge']):g='04 Escalators'
 elif any(k in n for k in ['sofa','cushion','chair','table','vase','olive','planter','soil','bench','console']):g='02 Furniture and planting'
 elif any(k in n for k in ['shop','boutique','retail','display','island product']):g='03 Retail'
 elif any(k in n for k in ['studio ground','section model','project title']):g='07 Presentation'
 else:g='01 Architecture'
 groups[g].objects.link(o)
 for c in list(o.users_collection):
  if c!=groups[g]:c.objects.unlink(o)
s.render.resolution_x=1440;s.render.resolution_y=1152
s['retail_floor_count']=4;s['parking_floor_count']=1;s['parking_vehicle_count']=9
result={'objects':len(s.objects),'collections':list(groups),'camera':s.camera.name}
