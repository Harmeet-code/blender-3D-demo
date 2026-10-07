import bpy, math, random
from mathutils import Vector
random.seed(19)
s=bpy.context.scene
def mat(name,color,rough=.45,metal=0,emit=0):
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
# Architectural section: four public levels above a full basement.
box('Basement foundation / B1',(0,0,-4.35),(36,26,.5),concrete,.16)
box('Basement rear retaining wall',(0,12.6,-2.15),(36,.4,4),concrete,.08)
box('Basement left retaining wall',(-17.8,0,-2.15),(.4,25,4),concrete,.08)
for level in range(4):
 z=level*4.4
 if level==0: box('L00 continuous public floor',(0,0,z-.23),(32,22,.46),stone,.12)
 else:
  for x in [-12,12]:box(f'L{level:02} gallery slab', (x,0,z-.23),(8,22,.46),stone,.12)
  box(f'L{level:02} rear gallery slab',(0,7.5,z-.23),(16,7,.46),stone,.12)
 for x in [-12,12]:
  box(f'L{level:02} front fascia',(x,-11,z-.25),(8,.14,.42),edge,.035)
  box(f'L{level:02} bronze front reveal',(x,-11.08,z-.35),(7.8,.06,.055),bronze)
  box(f'L{level:02} luminous soffit',(x,-10.95,z-.47),(7.6,.08,.035),warm)
 box(f'L{level:02} rear limestone wall',(0,10.8,z+1.85),(32,.38,3.8),stone,.06)
 for x in [-15.6,15.6]:
  for y in [-10,3,10]:
   box(f'L{level:02} pier',(x,y,z+2),(.48,.48,4),edge,.05)
 if level>0:
  for x in [-8,8]:
   box(f'L{level:02} glass balustrade',(x,-3.45,z+.66),(.045,14.8,1.25),glass,.02)
   box(f'L{level:02} bronze handrail',(x,-3.45,z+1.3),(.085,14.8,.075),bronze,.025)
   box(f'L{level:02} lit balcony rim',(x,-3.45,z-.1),(.1,14.8,.055),warm)
   for y in [-10.6,-7,-3.5,0,3.5]:box('Bronze balustrade shoe',(x,y,z+.13),(.14,.11,.27),bronze,.02)
  box('Rear atrium glass',(0,4,z+.65),(16,.045,1.25),glass)
  box('Rear balcony handrail',(0,4,z+1.3),(16,.075,.075),bronze,.02)
  box('Rear balcony warm reveal',(0,3.96,z-.1),(16,.08,.065),warm)
 text('Level number',f'{level+1:02}',(15.45,-11.12,z+.5),.65,bronze)
# Rear roof with open skylight ribs.
box('Roof rear cornice',(0,8.4,17.55),(33,6.5,.42),edge,.12)
for x in [-16.1,16.1]:box('Roof side cornice',(x,0,17.55),(.55,22,.42),edge,.08)
for x in [-12,-8,-4,0,4,8,12]:
 box('Slim skylight rib',(x,0,17.62),(.14,22,.2),bronze,.035)
box('Roof sign backdrop',(0,10.65,16.3),(15,.1,1),oak,.04)
text('Mall identity','A T R I U M',(0,10.53,16),.6,white)
# Ground-level arrival terrace leaves underground section visible.
box('Arrival stone terrace',(0,-12.8,-.3),(34,3.6,.45),edge,.1)
text('Basement section title','B1  /  PARKING',(0,-13.06,-3.3),.55,white)
# Key, fill and motivated interior ambient.
world=bpy.data.worlds.new('Blue hour atmosphere');s.world=world;world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.095,.14,.22,1);bg.inputs[1].default_value=.45
sun=light('Late afternoon sun',(-30,-20,35),2.3,(1,.73,.46),'SUN',(0,0,0));sun.data.angle=.15
light('Cool sky fill',(12,-18,28),2300,(.5,.68,1),'AREA',(0,2,5),25)
light('Warm atrium skylight',(-7,1,24),2600,(1,.79,.52),'AREA',(0,0,0),18)
for level in range(4):
 for x in [-12,0,12]:light(f'L{level:02} warm retail ambient',(x,5,level*4.4+3.25),160,(1,.73,.43),size=2)
for x in [-12,0,12]:light('Basement illumination',(x,0,-.9),230,(.65,.82,1),size=2)
# Presentation.
camdata=bpy.data.cameras.new('Architectural hero camera');cam=bpy.data.objects.new('Architectural hero camera',camdata);s.collection.objects.link(cam)
cam.location=(39,-55,30);cam.rotation_euler=(Vector((0,0,5.8))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=53;s.camera=cam
s.render.engine='BLENDER_EEVEE';s.render.resolution_x=1440;s.render.resolution_y=1152;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX'
s['design']='ATRIUM / four retail floors and B1 parking / architectural cutaway / warm dusk'
result={'objects':len(bpy.data.objects),'levels':4,'basement':True}


def sphere(name,loc,scale,ma):
 import bmesh
 if not hasattr(sphere,'cache'):sphere.cache={}
 mesh=sphere.cache.get(ma.name)
 if mesh is None:
  mesh=bpy.data.meshes.new('Shared sphere '+ma.name);bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=12,v_segments=8,radius=1);bm.to_mesh(mesh);bm.free();mesh.materials.append(ma)
  for p in mesh.polygons:p.use_smooth=True
  sphere.cache[ma.name]=mesh
 o=bpy.data.objects.new(name,mesh);s.collection.objects.link(o);o.location=loc;o.scale=scale;return o
def plant(x,y,z,h=2):
 cyl('Limestone planter',(x,y,z+.32),.53,.64,edge)
 cyl('Soil inset',(x,y,z+.65),.46,.04,soil)
 line('Olive trunk',(x,y,z+.65),(x+.12,y,z+h),.065,oak)
 for j in range(8):
  a=j*2.4;zz=z+h-.4+random.random()*.7
  xx=x+math.cos(a)*.4;yy=y+math.sin(a)*.4
  line('Olive branch',(x,y,z+h-.6),(xx,yy,zz),.025,oak)
  sphere('Olive leaf crown',(xx,yy,zz),(.48,.36,.36),green)
def sofa(x,y,z,flip=False):
 box('Sofa recessed bronze plinth',(x,y,z+.16),(2.8,1,.15),bronze,.045)
 box('Sofa upholstered base',(x,y,z+.4),(3.15,1.15,.42),fabric,.15)
 for xx in [-.96,0,.96]:
  box('Individual sofa seat cushion',(x+xx,y-.08,z+.66),(.91,.9,.18),fabric,.08)
  box('Sofa back cushion',(x+xx,y+.46,z+.95),(.94,.22,.66),fabric,.09)
 for xx in [-1.51,1.51]:box('Sofa curved arm',(x+xx,y,z+.76),(.22,1.1,.5),fabric,.09)
 for xx in [-.9,.9]:box('Terracotta scatter cushion',(x+xx,y+.18,z+.94),(.43,.2,.44),clay,.08)
def table(x,y,z,r=.62):
 cyl('Fluted bronze table pedestal',(x,y,z+.33),.14,.6,bronze)
 cyl('Table foot',(x,y,z+.06),.4,.09,bronze)
 cyl('Round travertine tabletop',(x,y,z+.67),r,.09,edge,40)
 cyl('Ceramic bud vase',(x+.13,y,z+.79),.065,.18,clay)
 line('Vase stem',(x+.13,y,z+.84),(x+.15,y,z+1.06),.012,green)
def chair(x,y,z):
 for dx in [-.24,.24]:
  for dy in [-.22,.22]:line('Chair tapered oak leg',(x+dx*1.2,y+dy*1.2,z),(x+dx,y+dy,z+.43),.028,oak)
 box('Lounge chair seat',(x,y,z+.48),(.67,.62,.17),clay,.1)
 box('Lounge chair curved back',(x,y+.25,z+.8),(.7,.14,.55),clay,.065)
# Shopfronts and genuinely furnished retail interiors.
brands=[['FORM / OBJECTS','MAISON','AURA / SKIN','NORD'],['STUDIO / 02','LINEN','ATELIER','MONO'],['SOUND / VISION','EDITIONS','GALLERY','MOTION'],['TERRA / CAFE','ROAST','THE TABLE','SKY LOUNGE']]
for level in range(4):
 z=level*4.4
 for idx,x in enumerate([-11.4,-3.8,3.8,11.4]):
  box('Shop oak feature wall',(x,10.52,z+1.65),(6.85,.13,3.25),oak,.035)
  box('Shop entry lintel',(x,6,z+3.32),(7.25,.28,.5),edge,.025)
  text('Boutique branding',brands[level][idx],(x,5.81,z+3.2),.27,bronze)
  for dx in [-3.47,3.47]:box('Shopfront bronze jamb',(x+dx,6,z+1.6),(.075,.12,3.2),bronze,.012)
  for dx in [-2.4,2.4]:
   box('Shopfront fixed glass',(x+dx,6,z+1.47),(2.02,.035,2.9),glass)
  for zz in [.8,1.5,2.2]:
   box('Floating retail display shelf',(x,10.18,z+zz),(5.7,.5,.065),edge,.02)
   for j in range(5):
    xx=x-2.1+j*1.05
    if (idx+level)%2:cyl('Display ceramic vessel',(xx,10.12,z+zz+.16),.1+.035*(j%2),.3,clay)
    else:box('Retail display object',(xx,10.12,z+zz+.18),(.24,.25,.32),fabric,.025)
  box('Retail display island',(x,8,z+.48),(2.6,.95,.9),edge,.07)
  for dx in [-.8,0,.8]:cyl('Island product',(x+dx,8,z+1.03),.12,.17,bronze)
  box('Shop overhead light',(x,8,z+3.55),(5,.08,.05),warm,.015)
 # Side lounges.
 for x in [-12,12]:
  sofa(x,-7.8,z)
  table(x,-9.35,z)
  plant(x+2.35,-7.9,z,1.5)
  table(x,-1.3,z)
  for dx in [-1.05,1.05]:chair(x+dx,-1.3,z)
  # low oak console with real slat divisions
  box('Gallery slatted oak console',(x,2.25,z+.43),(3.2,.6,.83),oak,.055)
  for k in range(16):box('Console vertical flute',(x-1.44+k*.19,1.92,z+.43),(.055,.055,.72),bronze,.01)
  plant(x+2.3,1.9,z,1.35)
 # Small recessed ceiling strips along outer galleries.
 for x in [-13.5,13.5]:
  for y in [-7,-1,4]:box('Ceiling ribbon light',(x,y,z+3.75),(.06,2.7,.035),warm,.01)
# Escalator pair, with discrete grooved treads, side stringers and continuous rails.
for level in range(3):
 z=level*4.4
 for side,x in enumerate([-3.2,3.2]):
  for step in range(32):
   t=step/31
   y=-5.9+9.5*t;zz=z+.1+4.4*t
   box('Escalator ribbed tread',(x,y,zz),(1.75,.32,.14),dark,.018)
   for dx in [-.58,0,.58]:box('Tread anti-slip rib',(x+dx,y,zz+.076),(.018,.26,.008),bronze)
  for dx in [-.99,.99]:
   line('Escalator stainless stringer',(x+dx,-6,z+.12),(x+dx,3.6,z+4.52),.13,bronze)
   line('Escalator smoked glass rail',(x+dx,-6,z+.64),(x+dx,3.6,z+5.04),.18,glass)
   line('Escalator continuous rubber handrail',(x+dx,-6,z+1.06),(x+dx,3.6,z+5.46),.065,dark)
  for y,zz in [(-6.4,z+.05),(3.95,z+4.45)]:box('Escalator landing plate',(x,y,zz),(2.1,.7,.08),bronze,.025)
# Sculptural atrium pendant constellation, an open spiral.
for i in range(22):
 a=i*.53;r=2.15
 x=math.cos(a)*r;y=-.1+math.sin(a)*r;z=10.5+i*.24
 line('Pendant suspension cable',(x,y,z),(x,y,17.45),.009,bronze)
 cyl('Pendant bronze collar',(x,y,z),.1,.3,bronze)
 sphere('Pendant opal diffuser',(x,y,z-.25),(.19,.19,.25),warm)
# Ground atrium seating garden.
for x in [-5.6,5.6]:
 plant(x,-8.5,0,2.7)
for x in [-2,2]:
 box('Arrival oak bench',(x,-12.5,.45),(2.8,.8,.16),oak,.055)
 for dx in [-.9,.9]:box('Bench stone support',(x+dx,-12.5,.2),(.18,.62,.4),edge,.03)
# Parking: marked stalls, accessible/EV zones, columns, service runs, cars.
paint=mat('Parking warm white markings',(.82,.86,.8),.6)
rubber=mat('Tire rubber',(.016,.018,.022),.84)
red=mat('Fire system red',(.44,.055,.025),.42,.3)
carcolors=[mat('Car pearl',(.76,.78,.72),.22,.5),mat('Car graphite',(.065,.09,.12),.22,.65),mat('Car muted copper',(.38,.17,.085),.2,.65),mat('Car sage',(.2,.32,.28),.22,.55)]
for x in [-14,-7,0,7,14]:
 for y in [-7,8]:
  box('B1 structural column',(x,y,-2.15),(.48,.48,3.8),concrete,.045)
  box('B1 teal column band',(x,y,-2.5),(.5,.5,1.05),teal,.03)
  text('B1 column code','B1',(x,y-.27,-2.5),.2,white)
for x in [-15,-12,-9,-6,-3,0,3,6,9,12,15]:
 for y in [-9,8.9]:box('Parking bay paint',(x,y,-4.08),(.07,5,.02),paint)
for x in [-13.5,-10.5,-7.5,-4.5,-1.5,1.5,4.5,7.5,10.5,13.5]:
 box('Wheel stop',(x,10.5,-3.98),(1.6,.2,.18),edge,.03)
for y in [-3.5,3.5]:
 for x in range(-15,16,3):box('Lane dash',(x,y,-4.08),(1.4,.07,.02),paint)
for x in [-12,-6,0,6,12]:
 box('Basement linear lamp',(x,0,-.6),(3.6,.12,.06),white)
 line('Red sprinkler main',(x,-10,-.85),(x,11,-.85),.045,red)
box('EV painted zone',(12,8.5,-4.075),(5.8,5,.022),teal)
for x in [10.5,13.5]:
 box('EV charger pedestal',(x,11,-3.38),(.42,.3,1.4),dark,.08)
 box('EV status screen',(x,10.83,-3.15),(.28,.02,.4),teal,.03)
 line('EV cable',(x+.2,10.8,-3.1),(x+.35,10.75,-3.8),.025,rubber)
def car(x,y,ma):
 z=-4.07
 box('Car sculpted lower body',(x,y,z+.6),(1.82,4.15,.64),ma,.25)
 box('Car hood',(x,y-1.35,z+.98),(1.73,1.25,.16),ma,.1)
 box('Car glass cabin',(x,y+.12,z+1.18),(1.5,2.1,.78),glass,.25)
 box('Car floating roof',(x,y+.16,z+1.58),(1.45,1.58,.1),ma,.08)
 for dx in [-.9,.9]:
  for dy in [-1.3,1.3]:
   o=cyl('Car tire',(x+dx,y+dy,z+.38),.37,.23,rubber);o.rotation_euler[1]=math.pi/2
   o=cyl('Car alloy wheel',(x+dx*1.13,y+dy,z+.38),.22,.015,bronze);o.rotation_euler[1]=math.pi/2
  box('Car mirror',(x+dx,y-.5,z+1.11),(.2,.25,.12),ma,.055)
  for dy in [-.3,.7]:box('Flush door handle',(x+dx*.97,y+dy,z+.93),(.03,.24,.04),bronze,.012)
 for dx in [-.59,.59]:
  box('Car headlamp',(x+dx,y-2.06,z+.77),(.45,.055,.12),white,.025)
  box('Car rear lamp',(x+dx,y+2.07,z+.77),(.48,.05,.1),red,.025)
for i,(x,y) in enumerate([(-13.5,-9),(-7.5,-9),(-1.5,-9),(7.5,-9),(13.5,-9),(-10.5,8.5),(-4.5,8.5),(4.5,8.5),(10.5,8.5)]):car(x,y,carcolors[i%4])
# A visible descending side ramp with matching guard walls.
ramp=box('Vehicle ramp into B1',(19,0,-2.15),(5,21,.3),concrete,.06);ramp.rotation_euler[0]=math.atan(4.1/21)
for x in [16.6,21.4]:
 o=box('Ramp edge parapet',(x,0,-1.7),(.2,21,.85),stone,.03);o.rotation_euler[0]=math.atan(4.1/21)
for y in [-8,-6,-4,-2,0,2,4,6,8]:
 z=-2.15+y*(4.1/21)+.2
 box('Ramp road dash',(19,y,z),(.09,.9,.025),paint)
box('Parking entry sign',(19,10,1.1),(4.4,.18,.9),teal,.05)
text('Parking direction','P  /  ENTRY',(19,9.88,.94),.38,white)
# Roof furniture and facade accent fins.
for x in [-15.6,15.6]:
 for y in [-8,-4,0,4,8]:box('Facade bronze vertical fin',(x,y,8.65),(.1,.32,17.3),bronze,.025)
# Site presentation plinth and calm background.
box('Section model dark plinth',(2,0,-4.75),(41,28,.35),dark,.12)
text('Project title on foundation','A T R I U M   /   THE QUIET GALLERY',(1,-14.18,-4.79),.28,bronze)
box('Studio ground',(0,0,-5.07),(200,200,.2),mat('Backdrop blue grey',(.075,.11,.14),.82))
# Dedicated inspection cameras remain editable.
for name,loc,target,lens in [('Interior promenade',(0,-12.5,2.2),(0,4,7.4),22),('B1 parking', (13,-15,-1.4),(-3,5,-2.5),22)]:
 d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens
s.camera.data.ortho_scale=57
s.camera.location=(38,-58,29)
s.camera.rotation_euler=(Vector((1,0,5.5))-s.camera.location).to_track_quat('-Z','Y').to_euler()
result={'objects':len(bpy.data.objects),'floors':['01','02','03','04'],'parking_cars':9,'cameras':[o.name for o in bpy.data.objects if o.type=='CAMERA']}
