"""ATRIUM P1: detailed architectural parking refinement, metres, Blender 4.5+."""
import bpy, bmesh, math, random, json, sys
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi
ROOT=Path(__file__).resolve().parent
random.seed(71)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'atrium.blend'))
s=bpy.context.scene
s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
# Work on a new file; retain all above-ground mall architecture.
old_parking=bpy.data.collections.get('05 Parking')
remove=set(old_parking.objects) if old_parking else set()
remove.update(o for o in s.objects if o.location.z < -.55)
for o in remove:bpy.data.objects.remove(o,do_unlink=True)
for c in list(bpy.data.collections):
 if c.name.startswith('P1 |'):bpy.data.collections.remove(c)
collections={}
for name in ['Architecture','Columns and protection','Road markings','Services','Wayfinding','Vehicles','Two wheelers','Lift lobby','Ramp','Lights']:
 c=bpy.data.collections.new('P1 | '+name);s.collection.children.link(c);collections[name]=c
C=collections['Architecture']
def collection(name):
 global C
 C=collections[name]
def mesh(name,verts,faces,ma,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 if ma:me.materials.append(ma)
 o=bpy.data.objects.new(name,me);C.objects.link(o)
 if smooth:
  for p in me.polygons:p.use_smooth=True
 return o
def material(name,color,rough=.45,metal=0,emission=0,coat=0):
 m=bpy.data.materials.new('P1 / '+name);m.use_nodes=True;m.diffuse_color=(*color,1)
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 p.inputs['Coat Weight'].default_value=coat;p.inputs['Coat Roughness'].default_value=.18
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
def texture(m,scale,strength,roughness=None):
 nodes=m.node_tree.nodes;links=m.node_tree.links;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
 tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=scale;tex.inputs['Detail'].default_value=3
 coord=nodes.new('ShaderNodeTexCoord');links.new(coord.outputs['Object'],tex.inputs['Vector'])
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.25;bump.inputs['Distance'].default_value=strength
 links.new(tex.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],p.inputs['Normal'])
 if roughness:
  ramp=nodes.new('ShaderNodeMapRange');ramp.inputs['From Min'].default_value=0;ramp.inputs['From Max'].default_value=1;ramp.inputs['To Min'].default_value=roughness[0];ramp.inputs['To Max'].default_value=roughness[1]
  links.new(tex.outputs['Fac'],ramp.inputs['Value']);links.new(ramp.outputs[0],p.inputs['Roughness'])
 return m
concrete=texture(material('Board cast concrete',(.31,.32,.31),.77),4,.023,(.62,.82))
dark_concrete=texture(material('Concrete soffits',(.24,.265,.27),.8),7,.014)
epoxy=texture(material('Satin graphite epoxy',(.095,.13,.15),.29,0,.0,.25),90,.0008,(.21,.34))
teal=texture(material('Signal teal enamel',(.018,.38,.37),.34),120,.0005)
charcoal=material('Scuff resistant charcoal',(.035,.044,.052),.64)
yellow=material('Canary yellow',(.95,.62,.018),.42)
paint=texture(material('Reflective white road paint',(.8,.84,.82),.48),100,.0007)
black=material('Powder coated black',(.016,.022,.028),.38,.2)
rubber=texture(material('Rubber',(.016,.019,.022),.85),65,.0013)
steel=texture(material('Galvanized steel',(.43,.5,.53),.32,.82),90,.0007,(.28,.42))
chrome=material('Machined bright aluminium',(.7,.77,.79),.19,.95)
red=material('Fire red enamel',(.52,.023,.013),.32,.25)
glass=material('Dark automotive glass',(.018,.034,.044),.095,.3,.0,.7)
clear=material('Lobby glazing',(.51,.67,.69),.08)
next(n for n in clear.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Transmission Weight'].default_value=.93
white_led=material('Cool LED diffuser',(.73,.86,1),.25,emission=5)
warm_led=material('Lobby warm LED', (1,.77,.39),.25,emission=5)
green_led=material('Available green',(.015,1,.24),.25,emission=4)
red_led=material('Occupied red',(1,.025,.008),.25,emission=4)
cyan_led=material('Charge active cyan',(.01,.85,1),.2,emission=4)
blue=material('Wayfinding electric blue',(.015,.13,.43),.4,emission=.4)
white_letters=material('Reflective sign lettering',(.85,.93,1),.3,emission=.4)
boltmat=material('Oxidized fasteners',(.13,.17,.19),.38,.75)
def box(name,loc,dim,ma,bevel=0):
 x,y,z=[a/2 for a in dim]
 o=mesh(name,[(-x,-y,-z),(-x,-y,z),(-x,y,-z),(-x,y,z),(x,-y,-z),(x,-y,z),(x,y,-z),(x,y,z)],[(2,6,4,0),(5,7,3,1),(4,5,1,0),(3,7,6,2),(1,3,2,0),(6,7,5,4)],ma);o.location=loc
 if bevel:
  mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=3
  mod=o.modifiers.new('Corner normals','WEIGHTED_NORMAL')
 return o
CYL={}
def cyl(name,loc,r,d,ma,n=24):
 key=(ma.name,n)
 if key not in CYL:
  v=[(cos(i*2*pi/n),sin(i*2*pi/n),z) for z in [-.5,.5] for i in range(n)]
  f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  template=mesh('Cylinder template',v,f,ma)
  for p in template.data.polygons:p.use_smooth=len(p.vertices)==4
  CYL[key]=template.data;bpy.data.objects.remove(template,do_unlink=True)
 o=bpy.data.objects.new(name,CYL[key]);C.objects.link(o);o.location=loc;o.scale=(r,r,d);return o
def rod(name,a,b,r,ma):
 o=cyl(name,(Vector(a)+Vector(b))/2,r,(Vector(b)-Vector(a)).length,ma,16);o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler();return o
def curve(name,points,r,ma,cyclic=False):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=12;cu.bevel_depth=r;cu.bevel_resolution=3
 if name in ['Connected charging cable','Extinguisher hose']:
  sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
  for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 else:
  sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
  for p,co in zip(sp.points,points):p.co=(*co,1)
 sp.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,cu);C.objects.link(o);cu.materials.append(ma);return o
def torus(name,loc,major,minor,ma,rotation=(0,0,0),segments=40):
 v=[];f=[]
 for i in range(segments):
  a=i*2*pi/segments
  for j in range(12):
   b=j*2*pi/12;v.append(((major+minor*cos(b))*cos(a),(major+minor*cos(b))*sin(a),minor*sin(b)))
 for i in range(segments):
  for j in range(12):f.append((i*12+j,((i+1)%segments)*12+j,((i+1)%segments)*12+(j+1)%12,i*12+(j+1)%12))
 o=mesh(name,v,f,ma,True);o.location=loc;o.rotation_euler=rotation;return o
font=bpy.data.fonts.load('C:/Windows/Fonts/bahnschrift.ttf')
fontbold=bpy.data.fonts.load('C:/Windows/Fonts/segoeuib.ttf')
def label(body,loc,size,ma=white_letters,name='Sign typography',rot=(pi/2,0,0),align='CENTER'):
 cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.size=size;cu.align_x=align;cu.extrude=.0006;cu.font=fontbold
 o=bpy.data.objects.new(name,cu);C.objects.link(o);cu.materials.append(ma);o.location=loc;o.rotation_euler=rot;return o
def lamp(name,loc,target,power,color,size=3,shape='DISK',size_y=None):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape=shape;d.size=size
 if size_y is not None:d.size_y=size_y
 o=bpy.data.objects.new(name,d);collections['Lights'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
F=-5.2
box('P1 | Structural raft',(0,0,F-.28),(45,45,.55),concrete,.08)
box('P1 | Seamless satin epoxy',(0,0,F-.014),(44,44,.028),epoxy,.012)
box('P1 | Ceiling slab and forecourt',(0,0,-.42),(45,45,.4),concrete,.04)
# The ground mall stays above the basement and an extended plaza covers the new garage.
for y in [-21.8,21.8]:box('P1 | Retaining wall',(0,y,-2.85),(44,.4,4.7),concrete,.025)
box('P1 | West retaining wall',(-21.8,0,-2.85),(.4,44,4.7),concrete,.025)
for y,depth in [(-16,11.5),(9,25.5)]:box('P1 | Ramp portal wall',(21.8,y,-2.85),(.4,depth,4.7),concrete,.025)
for y in [-17.5,3.2,17.5]:
 box('P1 | Structural cross beam',(0,y,-.89),(44,.7,.55),dark_concrete,.02)
for x in [-18.7,-8.5,1.7,11.9]:
 box('P1 | Longitudinal beam',(x,0,-.84),(.68,44,.45),dark_concrete,.02)
# Formwork tie pockets, panel lines and damp plinths provide scale without random clutter.
for x in range(-20,22,3):
 for z in [F+.8,F+2.5,F+3.8]:
  o=cyl('Formwork tie recess',(x,21.57,z),.032,.008,charcoal,16);o.rotation_euler[0]=pi/2
 box('Concrete formwork vertical joint',(x,21.585,-2.9),(.012,.012,4.5),charcoal)
for y in [-21.55,21.55]:
 box('Dark wall plinth',(0,y,F+.18),(43,.035,.36),charcoal)
collection('Columns and protection')
for row,y in enumerate([-17.5,3.2,17.5]):
 for j,x in enumerate([-18.7,-8.5,1.7,11.9]):
  code='P1-'+chr(65+row)+f'{([1,2,3,4] if row<2 else [6,7,8,9])[j]:02}'
  box(code+' concrete core',(x,y,-2.88),(.78,.78,4.6),concrete,.025)
  box(code+' charcoal base',(x,y,F+.63),(.805,.805,1.26),charcoal,.018)
  box(code+' signal teal',(x,y,F+2.26),(.811,.811,2.0),teal,.012)
  box(code+' reflective band',(x,y,F+1.27),(.824,.824,.055),paint,.012)
  for side in [-1,1]:
   rot=(pi/2,0,0) if side<0 else (pi/2,0,pi)
   label('P1',(x,y+side*.417,F+2.61),.3,rot=rot,name=code+' level stencil')
   label(code.split('-')[1],(x,y+side*.42,F+2.11),.4,rot=rot,name=code+' coordinate')
  for dx in [-.33,.33]:
   for dy in [-.416,.416]:
    box('Bolted impact rubber guard',(x+dx,y+dy,F+.64),(.14,.07,1.04),rubber,.025)
    verts=[];faces=[]
    for k in range(5):
     zz=F+.2+k*.19
     yy=y+dy+(-.041 if dy<0 else .041)
     v=[(x+dx-.065,yy,zz),(x+dx+.065,yy,zz+.085),(x+dx+.065,yy,zz+.15),(x+dx-.065,yy,zz+.065)]
     start=len(verts);verts+=v;faces.append(tuple(range(start,start+4)))
    mesh('Yellow diagonal corner chevrons',verts,faces,yellow)
    for zz in [F+.18,F+1.08]:
     o=cyl('Guard anchor bolt',(x+dx,y+dy+(-.047 if dy<0 else .047),zz),.021,.016,chrome,6);o.rotation_euler[0]=pi/2
# Parking bays are consistently dimensioned and identified. Each row has 11 bays.
collection('Road markings')
angle=math.radians(18)
def xy(x,y,u,v):return (x+u*cos(angle)-v*sin(angle),y+u*sin(angle)+v*cos(angle))
bay_centers={}
occupied={'A':[0,2,3,5,7,8,10],'B':[0,2,4,5,7,9],'C':[1,3,4,6,10]}
for row,y in zip('ABC',[-14,0,14]):
 facing=-1 if row=='A' else 1
 for j in range(11):
  x=-17+3.4*j;code=f'P1-{row}{j+1:02}';bay_centers[code]=(x,y)
  if row=='C' and j in [7,8]:continue # protected pedestrian approach to Lift 2
  for u in [-1.43,1.43]:
   xx,yy=xy(x,y,u,0);o=box('Bay line '+code,(xx,yy,F+.002),(.095,5.8,.004),paint);o.rotation_euler[2]=angle
  xx,yy=xy(x,y,0,-3.32*facing);label(code,(xx,yy,F+.005),.26,paint,rot=(0,0,angle+(pi if row=='A' else 0)),name='Floor bay code '+code)
  xx,yy=xy(x,y,0,2.04*facing);o=box('Bolted wheel stop '+code,(xx,yy,F+.095),(1.8,.22,.19),rubber,.045);o.rotation_euler[2]=angle
  for u in [-.59,.59]:
   xx,yy=xy(x,y,u,2.04*facing);cyl('Wheel stop bolt',(xx,yy,F+.198),.023,.007,chrome,12)
  for u in [-.63,0,.63]:
   xx,yy=xy(x,y,u,1.916*facing);o=box('Wheel stop reflective tab',(xx,yy,F+.1),(.32,.009,.05),yellow,.005);o.rotation_euler[2]=angle
  # Small ceiling sensor and downward luminous indicator.
  xx,yy=xy(x,y,0,-2.65*facing)
  cyl('Ultrasonic occupancy sensor '+code,(xx,yy,-1.02),.115,.08,paint)
  cyl('Bay status '+code,(xx,yy,-1.068),.055,.018,red_led if j in occupied[row] else green_led)
def arrow(x,y,rot=0,scale=1):
 pts=[(-.13,-1),(.13,-1),(.13,.25),(.52,.25),(0,1),(-.52,.25),(-.13,.25)]
 o=mesh('One-way yellow floor arrow',[(u*scale,v*scale,F+.003) for u,v in pts],[tuple(range(7))],yellow);o.location=(x,y,0);o.rotation_euler[2]=rot
for x in [-15,-5,5,15]:arrow(x,-7,pi/2,1.15);arrow(x,7,-pi/2,1.15)
# Floor traffic line, drainage channels and raised grates.
for y in [-10.0,10]:
 box('Stainless linear trench',(0,y,F-.003),(41,.19,.026),steel,.012)
 box('Drain channel darkness',(0,y,F+.012),(41,.145,.02),black)
 verts=[];faces=[]
 for j in range(410):
  x=-20.4+j*.1;a=len(verts);verts.extend([(x,y-.07,F+.025),(x+.025,y-.07,F+.025),(x+.025,y+.07,F+.025),(x,y+.07,F+.025)]);faces.append((a,a+1,a+2,a+3))
 mesh('Cast iron drain grate bars',verts,faces,boltmat)
for x in [-20.6,20.6]:box('Pedestrian perimeter yellow line',(x,0,F+.017),(.095,42,.016),yellow)
# Zebra crossing aligned to the central lobby access.
for y in [5.5,6.2,6.9,7.6,8.3,9]:
 box('Pedestrian crossing',(8,y,F+.02),(3.5,.35,.016),paint)
box('Protected teal pedestrian approach',(7.8,15.0,F+.002),(2.8,11.3,.004),teal)
for x in [6.32,9.28]:
 box('Pedestrian path yellow edge',(x,15,F+.004),(.085,11.3,.006),yellow)
 for y in [10.0,19.9]:
  cyl('Pedestrian protection bollard',(x,y,F+.48),.07,.96,steel)
  cyl('Reflective bollard collar',(x,y,F+.74),.074,.16,yellow)
label('MALL ENTRANCE',(7.8,17.5,F+.007),.25,paint,rot=(0,0,0),name='Pedestrian route floor legend')
# Ceiling service hierarchy: rectangular trunk ducts, flange seams, hangers, sprinklers, trays.
collection('Services')
for y in [-8.7,8.7]:
 box('Galvanized supply air trunk',(0,y,-1.31),(41,1.02,.55),steel,.035)
 for x in range(-20,22,2):
  box('Duct gasket seam',(x,y,-1.31),(.034,1.055,.585),charcoal,.012)
  box('Duct flange',(x+.045,y,-1.31),(.045,1.09,.62),steel,.008)
  for dy in [-.7,.7]:rod('Threaded duct hanger',(x,y+dy,-.65),(x,y+dy,-1.69),.012,steel)
  box('Duct trapeze support',(x,y,-1.67),(.045,1.5,.035),steel,.006)
 for x in [-14,-2,10]:
  box('Air branch',(x,y+1.75,-1.31),(.7,2.5,.38),steel,.025)
  box('Louver neck',(x,y+2.6,-1.56),(.7,.7,.18),steel,.012)
  for i in range(9):box('Air supply louver blade',(x-.29+i*.073,y+2.6,-1.67),(.03,.64,.045),charcoal,.008)
for y in [-11,5.1,19]:
 rod('Red fire sprinkler main',(-21,y,-1.17),(21,y,-1.17),.074,red)
 for x in range(-19,22,4):
  torus('Sprinkler pipe coupling',(x,y,-1.17),.083,.013,red,(0,pi/2,0),24)
  rod('Sprinkler transverse branch',(x,y,-1.17),(x,y-2.5,-1.17),.035,red)
  rod('Pendant sprinkler stem',(x,y-2.5,-1.17),(x,y-2.5,-1.43),.014,chrome)
  cyl('Sprinkler deflector',(x,y-2.5,-1.46),.045,.016,chrome,16)
# Pressure gauge and shutoff near foreground service riser.
rod('Fire riser',(20,-18,F+.4),(20,-18,-1.17),.075,red)
torus('Fire shutoff hand wheel',(20,-18.17,F+1.4),.17,.024,red,(pi/2,0,0))
rod('Gauge stem',(20,-18,F+2.6),(20,-18.25,F+2.6),.023,chrome)
o=cyl('Pressure gauge stainless bezel',(20,-18.29,F+2.6),.14,.06,chrome);o.rotation_euler[0]=pi/2
o=cyl('Pressure gauge white face',(20,-18.329,F+2.6),.118,.005,paint);o.rotation_euler[0]=pi/2
rod('Gauge indicator',(20,-18.34,F+2.6),(20.055,-18.34,F+2.67),.004,black)
for y in [-5.4,5.4]:
 for side in [-.25,.25]:box('Cable tray side rail',(0,y+side,-1.08),(42,.045,.16),steel,.012)
 for x in [i*.35-21 for i in range(121)]:box('Perforated tray rung',(x,y,-1.12),(.032,.48,.028),steel)
 for dy in [-.16,-.08,0,.08,.16]:rod('Bundled black electrical conduit',(-21,y+dy,-1.05),(21,y+dy,-1.05),.023,charcoal)
 for x in range(-20,21,4):
  for dy in [-.28,.28]:rod('Cable tray suspension',(x,y+dy,-.64),(x,y+dy,-1.19),.009,chrome)
# Ventilation monitoring boxes are visual props, no engineering thresholds implied.
for x in [-15,0,15]:
 box('CO NO2 sensor housing',(x,21.5,F+1.65),(.28,.1,.22),paint,.025)
 label('CO / NO2',(x,21.44,F+1.63),.044,black,name='Ventilation sensor label')
# Continuous strip housings form perspective-leading lines.
for y in [-6.9,6.9,-18.8,18.8]:
 for x in [-15,-5,5,15]:
  box('Suspended LED extrusion',(x,y,-1.59),(8.8,.16,.09),black,.016)
  box('Continuous opal diffuser',(x,y,-1.644),(8.7,.125,.024),white_led,.009)
  for dx in [-3.7,3.7]:rod('Luminaire suspension',(x+dx,y,-.66),(x+dx,y,-1.55),.007,chrome)
  lamp('Cool linear aisle lighting',(x,y,-1.68),(x,y,F),380,(.72,.85,1),8,'RECTANGLE',1.1)
# Illuminated directional boards, readable on both faces.
collection('Wayfinding')
def board(x,y,body,sub,width=7.6):
 start=set(C.objects)
 box('Double-sided black aluminium direction board',(x,y,-1.98),(width,.18,.78),black,.05)
 for side in [-1,1]:
  yy=y+side*.105;rot=(pi/2,0,0) if side<0 else (pi/2,0,pi)
  label(body,(x,yy,-1.86),.37,white_letters,name='LED direction legend',rot=rot)
  label(sub,(x,yy,-2.16),.13,white_letters,name='Secondary direction legend',rot=rot)
  box('Blue illuminated sign edge',(x,yy,-2.34),(width-.18,.017,.035),cyan_led,.007)
 for dx in [-width*.38,width*.38]:rod('Sign suspension rod',(x+dx,y,-.64),(x+dx,y,-1.57),.012,steel)
 for o in set(C.objects)-start:
  dx=o.location.x-x;dy=o.location.y-y;o.location.x=x-dy;o.location.y=y+dx;o.rotation_euler.z+=pi/2
board(6,-7,'Mall Entrance & Lifts  →','CENTRAL PLAZA   /   LIFT 2')
board(-10,7,'EV Charging Zone  ←','AC CHARGING   /   ROW B',6.4)
board(10,7,'Hypermarket Access  ↑','P1   /   PEDESTRIAN ROUTE',6.8)
board(21,-7,'Exit to Street Level  →','ONE WAY   /   KEEP LEFT',6.8)
box('Zone A landmark teal wall',(-21.555,-6.9,F+2),(.025,8.0,3.8),teal,.012)
label('P1',(-21.53,-6.9,F+1.67),1.7,white_letters,name='Large P1 wall landmark',rot=(pi/2,0,pi/2))
label('ATRIUM  /  ZONE A',(-21.515,-6.9,F+1.24),.23,white_letters,name='P1 wall descriptor',rot=(pi/2,0,pi/2))
box('Landmark yellow architectural line',(-21.51,-6.9,F+.72),(.022,7.2,.085),yellow)
# Convex mirrors use a spherical cap with chrome coating.
for x,y in [(20,-10.5),(-20,4),(12,17)]:
 verts=[(0,-.095,0)];faces=[];n=48
 for j in range(1,7):
  r=.44*j/6;dep=-.095*(1-(r/.44)**2)
  for i in range(n):verts.append((r*cos(i*2*pi/n),dep,r*sin(i*2*pi/n)))
 for i in range(n):faces.append((0,1+i,1+(i+1)%n))
 for j in range(5):
  for i in range(n):a=1+j*n+i;b=1+j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
 o=mesh('Convex safety mirror',verts,faces,chrome,True);o.location=(x,y,-2)
 torus('Orange safety mirror rim',(x,y,-2),.45,.034,yellow,(pi/2,0,0))
 for dx in [-.25,.25]:rod('Mirror suspension chain',(x+dx,y,-.7),(x+dx,y,-1.64),.012,steel)
# A sculpted vehicle assembly, with wheel arches, fitted glazing and detailed wheels.
collection('Vehicles')
car_blue=texture(material('Midnight blue metallic',(.022,.073,.16),.22,.7,coat=.65),180,.00015,(.18,.23))
car_silver=material('Platinum silver metallic',(.48,.56,.62),.2,.8,coat=.65)
car_white=texture(material('Dusty pearl white',(.7,.72,.68),.32,.35,coat=.3),16,.0007,(.25,.38))
car_copper=material('Warm graphite metallic',(.16,.115,.08),.24,.72,coat=.55)
car_graphite=material('Graphite blue metallic',(.06,.085,.10),.23,.7,coat=.5)
brake=material('Brake disc brushed steel',(.26,.3,.32),.4,.85)
seat=material('Vehicle charcoal leather',(.027,.031,.032),.7)
def vehicle(kind,paintmat):
 start=set(C.objects);suv=kind=='SUV';ev=kind=='EV'
 length=4.9 if suv else 4.65;width=1.94 if suv else 1.85;w=width/2;top=1.76 if suv else 1.45
 sections=[(-length/2,.80,.77),(-length/2+.2,.96,.89),(-1.8,1,1.03),(-1.1,1,1.08),(0,1,1.07),(1.2,1,1.07),(2.0,.98,.98),(length/2,.84,.85)]
 v=[];f=[]
 for y,fac,h in sections:
  profile=[(-w*.83,.37),(-w,.55),(-w,.85),(-w*.94,h),(-w*.72,h+.045),(w*.72,h+.045),(w*.94,h),(w,.85),(w,.55),(w*.83,.37)]
  v += [(x*fac,y,z) for x,z in profile]
 for j in range(len(sections)-1):
  for i in range(10):f.append((j*10+i,j*10+(i+1)%10,(j+1)*10+(i+1)%10,(j+1)*10+i))
 f += [tuple(reversed(range(10))),tuple(range((len(sections)-1)*10,len(sections)*10))]
 body=mesh(kind+' sculpted body',v,f,paintmat,True)
 # Real wheel openings, applied only to the reusable master.
 for wx in [-w,w]:
  for wy in [-1.48,1.45]:
   cutter=cyl('Temporary wheel arch',(wx,wy,.41),.465,.7,black,32);cutter.rotation_euler[1]=pi/2
   mod=body.modifiers.new('Wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
   bpy.context.view_layer.objects.active=body;body.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);body.select_set(False)
   bpy.data.objects.remove(cutter,do_unlink=True)
 mod=body.modifiers.new('Automotive edge finishing','BEVEL');mod.width=.035;mod.segments=3
 mod=body.modifiers.new('Body normals','WEIGHTED_NORMAL')
 # Cabin: four separate windows, solid A/B/C pillars and smoothly edged roof.
 front=-1.08;roof_front=-.48;roof_rear=1.10 if suv else .8;rear=1.86 if suv else 1.55;rw=w*.78
 o=box(kind+' roof',(0,(roof_front+roof_rear)/2,top),(rw*2,roof_rear-roof_front,.085),paintmat,.07)
 for side in [-1,1]:
  sidepts=[(side*w*.88,front,1.08),(side*rw,roof_front,top-.06),(side*rw,roof_rear,top-.06),(side*w*.9,rear,1.07)]
  mesh(kind+' side glazing',sidepts,[(0,1,2,3)],glass)
  curve(kind+' polished window trim',sidepts,.019,chrome,True)
  rod(kind+' A pillar',sidepts[0],sidepts[1],.052,paintmat)
  rod(kind+' C pillar',sidepts[2],sidepts[3],.075,paintmat)
  rod(kind+' B pillar',(side*w*.9,.35,1.08),(side*rw,.35,top-.05),.044,black)
  for yy in [-.37,1.02]:
   box(kind+' flush door handle',(side*(w+.005),yy,1.02),(.032,.23,.038),chrome,.013)
   curve(kind+' door shut line',[(side*(w+.012),yy+.3,1.02),(side*(w+.013),yy+.35,.48)],.004,charcoal)
  box(kind+' side skirt',(side*w,0,.4),(.08,2.2,.12),black,.03)
  rod(kind+' mirror stem',(side*w,-.69,1.13),(side*(w+.19),-.7,1.17),.034,black)
  box(kind+' aero mirror housing',(side*(w+.24),-.69,1.19),(.26,.29,.13),paintmat,.06)
  box(kind+' mirror glass',(side*(w+.24),-.532,1.19),(.21,.012,.09),chrome,.025)
  for yy in [-1.48,1.45]:
   pts=[(side*(w+.013),yy+.47*cos(a*pi/22),.41+.47*sin(a*pi/22)) for a in range(23)]
   curve(kind+' wheel arch lip',pts,.025,black)
 mesh(kind+' panoramic windscreen',[(-w*.88,front,1.09),(w*.88,front,1.09),(rw,roof_front,top-.06),(-rw,roof_front,top-.06)],[(0,1,2,3)],glass)
 mesh(kind+' rear glass',[(-rw,roof_rear,top-.06),(rw,roof_rear,top-.06),(w*.9,rear,1.08),(-w*.9,rear,1.08)],[(0,1,2,3)],glass)
 for xx in [-.44,.44]:
  box(kind+' seat',(xx,.23,.93),(.5,.6,.15),seat,.08)
  box(kind+' seat back',(xx,.47,1.12),(.5,.18,.55),seat,.08)
  box(kind+' headrest',(xx,.5,1.43 if suv else 1.31),(.25,.14,.2),seat,.06)
 box(kind+' dashboard',(0,-.75,1.03),(1.5,.32,.2),seat,.05)
 torus(kind+' steering wheel',(-.45,-.63,1.17),.15,.021,black,(pi/3,0,0),24)
 for xx in [-.5,.5]:rod(kind+' wiper',(xx,-1.03,1.14),(xx+.3,-.85,1.24),.009,black)
 # Bumpers, grille slats, lamps, number plates and rear lower valance.
 for yy in [-length/2,length/2]:
  box(kind+' bumper lower',(0,yy,.45),(1.56,.08,.18),black,.06)
  box(kind+' registration surround',(0,yy+(-.05 if yy<0 else .05),.68),(.54,.025,.13),black,.015)
  box(kind+' plate',(0,yy+(-.067 if yy<0 else .067),.68),(.49,.007,.095),paint,.005)
 for xx in [-.57,.57]:
  box(kind+' headlight smoked lens',(xx,-length/2-.018,.89),(.55,.08,.15),glass,.045)
  box(kind+' LED DRL',(xx,-length/2-.065,.92),(.5,.009,.025),white_led,.01)
  box(kind+' red taillight',(xx,length/2+.03,.94),(.58,.055,.065),red_led,.022)
  box(kind+' reverse lens',(xx,length/2+.065,.87),(.16,.012,.034),paint,.008)
 if not ev:
  box(kind+' grille',(0,-length/2-.022,.72),(.73,.04,.22),black,.04)
  for j in range(9):box(kind+' grille vertical fin',(-.3+j*.075,-length/2-.05,.72),(.018,.018,.16),chrome,.005)
 else:box('EV clean grille fascia',(0,-length/2-.027,.76),(.8,.034,.23),paintmat,.06)
 # Detailed pneumatic tyres with five split spokes, lug nuts and brakes.
 for side in [-1,1]:
  for yy in [-1.48,1.45]:
   xx=side*(w-.018);outer=side*(w+.126)
   torus(kind+' pneumatic tyre',(xx,yy,.39),.302,.093,rubber,(0,pi/2,0),48)
   disc=cyl(kind+' brake rotor',(side*(w+.065),yy,.39),.235,.028,brake,40);disc.rotation_euler[1]=pi/2
   torus(kind+' forged rim',(outer,yy,.39),.265,.019,chrome,(0,pi/2,0),40)
   for j in range(5):
    a=2*pi*j/5
    for offset in [-.07,.07]:
     rod(kind+' split alloy spoke',(outer,yy+.075*cos(a),.39+.075*sin(a)),(outer,yy+.25*cos(a+offset),.39+.25*sin(a+offset)),.017,chrome)
    b=cyl(kind+' wheel lug',(outer+side*.007,yy+.046*cos(a),.39+.046*sin(a)),.012,.012,chrome,8);b.rotation_euler[1]=pi/2
   hub=cyl(kind+' hubcap',(outer,yy,.39),.066,.027,chrome);hub.rotation_euler[1]=pi/2
   box(kind+' brake caliper',(side*(w+.078),yy+.17,.41),(.035,.065,.18),red,.019)
 if suv:
  for xx in [-.65,.65]:rod('SUV roof rail',(xx,-.35,top+.12),(xx,1.04,top+.12),.028,chrome)
 return list(set(C.objects)-start)
# Build only three masters; every parked instance shares its mesh data.
masters={}
for kind,ma in [('SUV',car_blue),('EV',car_silver),('Sedan',car_white)]:
 parts=vehicle(kind,ma);masters[kind]=parts
 for o in parts:o.hide_render=True;o.hide_set(True)
def instance_car(code,kind,ma,reverse=False):
 x,y=bay_centers[code];theta=angle+(pi if reverse else 0)
 root=bpy.data.objects.new(code+' '+kind,None);C.objects.link(root);root.location=(x,y,F+.005);root.rotation_euler[2]=theta
 for src in masters[kind]:
  o=src.copy();o.data=src.data;C.objects.link(o);o.hide_render=False;o.hide_set(False);o.parent=root
  # Use object-linked paint slots so repeated vehicles share geometry.
  for slot in o.material_slots:
   if slot.material and 'metallic' in slot.material.name.lower() or (slot.material and 'pearl white' in slot.material.name.lower()):
    slot.link='OBJECT';slot.material=ma
 return root
for row in 'ABC':
 for j in occupied[row]:
  code=f'P1-{row}{j+1:02}'
  kind='SUV' if (j+ord(row))%3==0 else 'Sedan'
  ma=[car_graphite,car_silver,car_copper,car_blue,car_white][(j+ord(row))%5]
  if code=='P1-A08':kind='SUV';ma=car_blue
  if code=='P1-B03':kind='EV';ma=car_silver
  if code=='P1-C11':kind='Sedan';ma=car_white
  instance_car(code,kind,ma,row=='A')
# Remove hidden templates while shared geometry remains used by the instances.
for parts in masters.values():
 for o in parts:bpy.data.objects.remove(o,do_unlink=True)
# EV equipment, trailing cable and animated status ring.
collection('Lift lobby')
ex,ey=bay_centers['P1-B03']
box('EV bay teal ground panel',(ex,ey,F+.002),(3.0,5.7,.012),teal,.03).rotation_euler[2]=angle
label('EV  /  CHARGING',(ex,ey-3.05,F+.033),.28,paint,rot=(0,0,angle),name='EV floor typography')
box('Charger protective pedestal',(ex-1.9,ey+2.9,F+.65),(.58,.5,1.3),charcoal,.1)
box('AC wall-mounted charging kiosk',(ex-1.9,ey+2.6,F+1.19),(.42,.18,.71),paint,.055)
box('Charging kiosk screen',(ex-1.9,ey+2.497,F+1.32),(.29,.015,.23),black,.012)
label('AC 22 kW',(ex-1.9,ey+2.482,F+1.31),.044,cyan_led)
for dx in [-.7,.7]:cyl('EV steel bollard',(ex-1.9+dx,ey+2.5,F+.45),.06,.9,steel)
# Cable hangs away from vehicle side and returns to the charging port.
port=xy(ex,ey,-1.01,.93)
curve('Connected charging cable',[(ex-1.9,ey+2.5,F+1.05),(ex-2.1,ey+2.3,F+.4),(ex-1.8,ey+1.5,F+.12),(port[0]-.24,port[1],F+.35),(port[0],port[1],F+1.04)],.027,rubber)
charge_halo=cyan_led.copy();charge_halo.name='P1 / Charging port pulse only'
o=torus('Pulsing charge port halo',(port[0],port[1],F+1.04),.069,.012,charge_halo,(0,pi/2,angle))
p=next(n for n in charge_halo.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
for f,value in [(1,2),(36,6),(72,2)]:
 p.inputs['Emission Strength'].default_value=value;p.inputs['Emission Strength'].keyframe_insert('default_value',frame=f)
# Tiny dashboard security indicator on the named white sedan.
cx,cy=bay_centers['P1-C11'];xx,yy=xy(cx,cy,-.55,-.8)
security=red_led.copy();security.name='P1 / C11 security blink only'
cyl('C11 dashboard security LED',(xx,yy,F+1.17),.01,.006,security,12)
sp=next(n for n in security.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
for frame,value in [(1,0),(6,4),(12,0),(30,0),(36,4),(42,0),(60,0),(66,4),(72,0)]:
 sp.inputs['Emission Strength'].default_value=value;sp.inputs['Emission Strength'].keyframe_insert('default_value',frame=frame)
# Yellow lift lobby: glazed entry, two elevator doors, payment and emergency equipment.
box('Canary yellow lift lobby feature wall',(8,21.52,F+2.0),(12,.13,4),yellow,.025)
box('Lift lobby inset portal',(8,21.36,F+1.58),(5.4,.17,3.16),black,.025)
for x in [5.35,10.65]:box('Lift entry brushed steel jamb',(x,21.20,F+1.56),(.11,.18,3.15),steel,.022)
box('Lift entry steel transom',(8,21.2,F+3.12),(5.4,.18,.12),steel,.02)
for x in [6.7,9.3]:
 box('Automatic sliding glass door',(x,21.12,F+1.52),(2.48,.03,2.98),clear,.006)
 box('Glass door bottom rail',(x,21.10,F+.09),(2.48,.07,.11),steel,.01)
 for dx in [-1.22,1.22]:box('Glass door stile',(x+dx,21.09,F+1.54),(.044,.06,2.98),steel,.008)
 label('ATRIUM',(x,21.07,F+1.4),.17,white_letters,name='Glass safety manifestation')
box('Warm lobby threshold',(8,20.94,F+.008),(5.4,.08,.02),warm_led)
label('CENTRAL PLAZA',(8,21.20,F+3.57),.46,black,name='Lift lobby identity')
label('LIFT 2   /   MALL ENTRANCE',(8,21.19,F+3.30),.19,black,name='Lift lobby descriptor')
# Portal luminous jamb reveals.
for x in [5.2,10.8]:box('Lobby warm reveal',(x,21.12,F+1.55),(.045,.035,3.12),warm_led,.009)
lamp('Warm lift lobby wash',(8,19.9,-1.3),(8,21,F+1.4),350,(1,.73,.36),4,'RECTANGLE',1)
# Behind-glass elevator leaves mounted into the feature portal.
for x in [6.65,9.35]:
 box('Elevator brushed stainless door',(x,21.25,F+1.35),(2.3,.04,2.6),steel,.01)
 box('Elevator door centre seam',(x,21.217,F+1.35),(.014,.012,2.6),black)
 label('02',(x,21.2,F+2.80),.14,white_letters)
# Tall naming banner and tactile directory.
box('Lift 2 central plaza naming banner',(3.2,21.28,F+2.2),(1.4,.13,1.65),black,.025)
label('LIFT 2',(3.2,21.20,F+2.57),.24,white_letters)
label('CENTRAL',(3.2,21.20,F+2.2),.13,white_letters)
label('PLAZA',(3.2,21.20,F+1.98),.16,white_letters)
label('P1',(3.2,21.20,F+1.6),.3,cyan_led)
# Pay-on-foot kiosk with tilted touch display, scanner and card reader.
box('Payment kiosk weighted base',(12.5,20.15,F+.07),(.88,.72,.14),charcoal,.065)
box('Payment kiosk brushed body',(12.5,20.15,F+.98),(.7,.53,1.82),steel,.075)
box('Payment kiosk black fascia',(12.5,19.864,F+1.12),(.60,.045,1.33),black,.025)
box('Payment touch display',(12.5,19.828,F+1.44),(.49,.017,.50),blue,.014)
label('PAY PARKING',(12.5,19.81,F+1.59),.065,white_letters)
label('SCAN YOUR TICKET',(12.5,19.81,F+1.47),.036,white_letters)
label('CARD  /  QR',(12.5,19.81,F+1.34),.045,cyan_led)
box('Barcode scanner',(12.35,19.81,F+.99),(.15,.04,.09),red_led,.012)
box('Contactless card reader',(12.65,19.81,F+.96),(.14,.055,.22),charcoal,.02)
box('Card reader illuminated slot',(12.65,19.777,F+1.01),(.105,.011,.018),green_led,.005)
box('Receipt slot',(12.5,19.818,F+.71),(.22,.015,.024),black,.007)
# Emergency cabinet with visible extinguisher and break-glass alarm.
box('Emergency cabinet frame',(15,21.1,F+1.25),(.72,.3,1.2),red,.035)
box('Emergency cabinet dark interior',(15,20.932,F+1.25),(.61,.03,1.07),charcoal,.008)
cyl('5 kg ABC extinguisher',(15,20.88,F+1.11),.135,.58,red,32)
cyl('Extinguisher shoulder',(15,20.88,F+1.42),.085,.1,red)
box('Extinguisher handle',(15,20.88,F+1.54),(.19,.08,.055),black,.015)
curve('Extinguisher hose',[(15.04,20.87,F+1.53),(15.22,20.87,F+1.4),(15.22,20.87,F+.89)],.016,rubber)
label('ABC',(15,20.725,F+1.12),.072,white_letters)
box('Emergency cabinet glazing',(15,20.70,F+1.25),(.62,.014,1.08),clear,.004)
box('Manual fire alarm pull station',(15.75,21.3,F+1.37),(.19,.12,.25),red,.02)
label('FIRE',(15.75,21.225,F+1.40),.036,white_letters)
# Two-wheeler corral, ground anchors, scooters, touring bikes and bicycles.
collection('Two wheelers')
for y in [18.8,21.2]:box('Two-wheeler yellow boundary',(-13,y,F+.02),(12,.07,.015),yellow)
label('TWO WHEELERS',(-13,18.3,F+.023),.45,yellow,rot=(0,0,0),name='Two-wheeler floor legend')
box('Two-wheeler wall sign',(-13,21.5,F+2.2),(6.8,.08,.75),black,.03)
label('Two-Wheeler Parking Only',(-13,21.446,F+2.3),.22,white_letters)
label('HELMETS MUST BE SECURED',(-13,21.444,F+1.99),.16,white_letters)
for x in [-18,-16,-14,-12,-10,-8]:
 curve('Black steel ground anchor rack',[(x-.36,20.4,F),(x-.36,20.4,F+.75),(x+.36,20.4,F+.75),(x+.36,20.4,F)],.038,black)
 for dx in [-.36,.36]:box('Rack base flange',(x+dx,20.4,F+.018),(.17,.19,.03),steel,.012)
def bike(x,y,motor=False,touring=False):
 # Vehicles aligned perpendicular to wall; independent formed tubes and wheels.
 radius=.29 if motor else .34;base=.93 if motor else .86
 for dy in [-base,base]:
  torus('Motorcycle tyre' if motor else 'Bicycle tyre',(x,y+dy,F+radius),radius-.05,.055 if motor else .024,rubber,(0,pi/2,0),32)
  torus('Alloy cycle rim',(x,y+dy,F+radius),radius-.075,.016,chrome,(0,pi/2,0),32)
  spoke_count=12 if motor else 32
  for j in range(spoke_count):
   a=j*2*pi/spoke_count;rod('Wheel spoke',(x,y+dy,F+radius),(x,y+dy+(radius-.08)*cos(a),F+radius+(radius-.08)*sin(a)),.0035 if not motor else .012,steel)
 a=(x,y-base,F+radius);b=(x,y+base,F+radius);c=(x,y-.18,F+.85);d=(x,y+.35,F+.75);e=(x,y,F+.38)
 for p,q in [(a,c),(c,e),(e,a),(c,d),(d,e),(d,b),(b,e)]:rod('Tubular vehicle frame',p,q,.023 if not motor else .043,steel if not motor else black)
 box('Bicycle saddle' if not motor else 'Motorcycle stepped seat',(x,y+.05,F+.91 if not motor else F+.83),(.22 if not motor else .46,.34 if not motor else .79,.09),rubber,.05)
 rod('Steering fork',(x,y-base,F+radius),(x,y-base+.12,F+1.05),.022,steel)
 rod('Handlebar',(x-.35,y-base+.08,F+1.09),(x+.35,y-base+.08,F+1.09),.023,black)
 if motor:
  box('Tourer fuel tank' if touring else 'Commuter scooter body',(x,y-.27,F+.71),(.46,.62,.47),charcoal,.17)
  box('Engine crankcase',(x,y+.06,F+.44),(.36,.46,.31),steel,.08)
  for zz in [.40,.46,.52]:box('Engine cooling fin',(x,y+.06,F+zz),(.41,.39,.022),black,.008)
  box('Scooter leg shield',(x,y-.66,F+.69),(.56,.12,.59),charcoal,.1)
  box('Motorcycle headlight',(x,y-.84,F+.96),(.25,.09,.14),white_led,.06)
  for dx in [-.33,.33]:
   rod('Bike mirror stem',(x+dx,y-.72,F+1.09),(x+dx,y-.74,F+1.34),.012,chrome)
   box('Bike rear-view mirror',(x+dx,y-.74,F+1.36),(.16,.055,.1),black,.04)
  curve('Center stand',[(x-.18,y+.1,F),(x-.12,y+.05,F+.33),(x+.12,y+.05,F+.33),(x+.18,y+.1,F)],.018,steel)
  if touring:
   for dx in [-.36,.36]:box('Tourer hard pannier',(x+dx,y+.58,F+.66),(.32,.56,.43),black,.065)
   # Helmet shell and dark visor hung from the handlebar.
   bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=24,v_segments=12,radius=1)
   me=bpy.data.meshes.new('Helmet shell');bm.to_mesh(me);bm.free();me.materials.append(charcoal)
   o=bpy.data.objects.new('Secured helmet shell',me);C.objects.link(o);o.location=(x+.33,y-.7,F+.91);o.scale=(.16,.18,.18)
   for p in me.polygons:p.use_smooth=True
   box('Helmet visor',(x+.33,y-.806,F+.96),(.23,.045,.105),glass,.045)
 else:
  torus('Bicycle chain ring',(x+.055,y,F+.38),.1,.012,chrome,(0,pi/2,0),32)
  curve('Bicycle drive chain',[(x+.07,y-.10,F+.43),(x+.07,y+.85,F+.38),(x+.07,y+.85,F+.29),(x+.07,y-.10,F+.31)],.005,boltmat,True)
  for side in [-1,1]:
   rod('Pedal crank',(x+side*.06,y,F+.38),(x+side*.12,y+side*.13,F+.38),.013,chrome)
   box('Bicycle pedal',(x+side*.17,y+side*.13,F+.38),(.15,.065,.035),black,.006)
  curve('Heavy steel U-lock',[(x-.10,y+.35,F+.45),(x-.1,y+.35,F+.7),(x+.1,y+.35,F+.7),(x+.1,y+.35,F+.45)],.014,black)
  rod('U-lock crossbar',(x-.13,y+.35,F+.46),(x+.13,y+.35,F+.46),.023,black)
for i,x in enumerate([-18,-16,-14,-12]):bike(x,19.8,True,i>=2)
for x in [-9.4,-7.7]:bike(x,19.8)
# Curved single-lane concrete access ramp: radius 22 m, drop 5.2 m.
collection('Ramp')
def ramp_point(t,r=22,zoff=0):
 a=-t*pi/2
 return (22+r*cos(a),15+r*sin(a),F*t+zoff)
def ribbon(name,r0,r1,z0,z1,ma):
 verts=[];faces=[];N=80
 for i in range(N+1):
  t=i/N
  verts.extend([ramp_point(t,r0,z0),ramp_point(t,r1,z0),ramp_point(t,r1,z1),ramp_point(t,r0,z1)])
 for i in range(N):
  for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
 faces += [(3,2,1,0),(N*4,N*4+1,N*4+2,N*4+3)]
 return mesh(name,verts,faces,ma)
ribbon('Sweeping curved concrete ramp',19.3,24.7,-.25,0,concrete)
ribbon('Ramp satin traction coating',19.55,24.45,.003,.014,epoxy)
for r0,r1 in [(19.3,19.55),(24.45,24.7)]:
 curve('Ramp continuous amber guidance',[ramp_point(i/100,r1+.012 if r0<20 else r0-.012,.30) for i in range(101)],.019,warm_led)
 # Full-height excavation wall connects the descending ramp to grade.
 verts=[];faces=[]
 for i in range(81):
  t=i/80
  a=ramp_point(t,r0,-.22);b=ramp_point(t,r1,-.22)
  cap=max(.20,F*t+1.02)
  verts.extend([a,b,(b[0],b[1],cap),(a[0],a[1],cap)])
 for i in range(80):
  for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
 mesh('Ramp excavation retaining wall',verts,faces,concrete)
for r0,r1 in [(0,19.25),(24.75,30)]:
 verts=[];faces=[]
 for i in range(81):
  a=-i*pi/160
  verts.extend([(22+r0*cos(a),15+r0*sin(a),-.035),(22+r1*cos(a),15+r1*sin(a),-.035)])
 for i in range(80):faces.append((i*2,i*2+1,(i+1)*2+1,(i+1)*2))
 mesh('Ramp surrounding paved forecourt',verts,faces,concrete)
for x in [41.1,46.9]:box('Entry portal upright',(x,14.4,1.67),(.15,.18,3.35),black,.035)
box('P1 entry portal sign',(44,14.4,3.15),(6,.22,.7),black,.06)
label('P1  /  MALL PARKING',(44,14.26,3.05),.37,white_letters,name='Ramp entry identity')
box('Clearance bar',(44,14.4,2.43),(5.3,.13,.12),yellow,.03)
label('MAX HEIGHT 2.4 m',(44,14.3,2.66),.15,black,name='Ramp clearance information')
for i in range(3,77):
 t=i/80
 if i%4 in [0,1]:
  t2=(i+.5)/80
  mesh('Painted ramp lane dash',[ramp_point(t,21.94,.018),ramp_point(t,22.06,.018),ramp_point(t2,22.06,.018),ramp_point(t2,21.94,.018)],[(0,1,2,3)],yellow)
for t in [.15,.4,.65,.9]:
 a=ramp_point(t,24.45,.8);b=ramp_point(t,22,0)
 lamp('Ramp wall wash',a,b,140,(1,.76,.42),1.5)
# Perimeter low-level luminaires and expansion seams.
for y in range(-18,21,6):
 box('Wall marker housing',(-21.57,y,F+.38),(.06,.46,.14),black,.02)
 box('Wall marker lens',(-21.525,y,F+.38),(.018,.38,.05),warm_led,.009)
# Service layers clear the beam soffits, then signs sit beneath the service zone.
for o in list(collections['Services'].objects):
 n=o.name.lower()
 if n.startswith('threaded duct hanger'):
  o.location.z-=.08;o.scale.z+=.16
 elif any(n.startswith(p) for p in ['galvanized supply','duct gasket','duct flange','duct trapeze','air branch','louver neck','air supply']):
  o.location.z-=.16
 elif any(n.startswith(p) for p in ['red fire sprinkler','sprinkler pipe coupling','sprinkler transverse','pendant sprinkler','sprinkler deflector']):
  o.location.z-=.35
 elif n.startswith('fire riser'):
  o.location.z-=.175;o.scale.z-=.35
 elif n.startswith('cable tray suspension'):
  o.location.z-=.11;o.scale.z+=.22
 elif any(n.startswith(p) for p in ['cable tray side','perforated tray rung','bundled black']):
  o.location.z-=.22
for o in list(collections['Wayfinding'].objects):
 if o.name.startswith('Sign suspension rod'):
  o.location.z-=.04;o.scale.z+=.08
 elif any(o.name.startswith(p) for p in ['Double-sided black','LED direction legend','Secondary direction legend','Blue illuminated sign edge']):
  o.location.z-=.08
collection('Services')
for y in [-11,5.1,19]:
 for x in range(-19,22,4):
  rod('Fire pipe threaded hanger',(x,y,-.65),(x,y,-1.60),.009,steel)
# Cameras and physically based rendering; above-ground mall materials remain intact.
collection('Lights')
def camera(name,loc,target,lens):
 d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);C.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_start=.08;return o
hero=camera('P1 | Cinematic aisle',(19.7,-7.2,F+1.65),(-14,-5.9,F+1.65),24)
camera('P1 | Lift lobby',(7.8,12.8,F+1.68),(8.7,21.2,F+1.65),22)
camera('P1 | EV detail',(-16.1,-4.7,F+1.5),(-10.4,1.0,F+1.0),32)
camera('P1 | Curved arrival',(43.5,10,1.1),(32,-4,-2.7),24)
s.camera=hero;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=48;s.cycles.use_denoising=True
s.cycles.max_bounces=7;s.cycles.diffuse_bounces=3;s.cycles.glossy_bounces=4;s.cycles.transmission_bounces=5
s.cycles.use_adaptive_sampling=True;s.cycles.adaptive_threshold=.045
s.render.resolution_x=1600;s.render.resolution_y=1000;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.film_transparent=False
s.view_settings.view_transform='AgX';s.view_settings.exposure=.45
if s.world and s.world.use_nodes:
 bg=next((n for n in s.world.node_tree.nodes if n.type=='BACKGROUND'),None)
 if bg:bg.inputs['Strength'].default_value=.18
# Original mall lighting remains intact; the solid ceiling occludes it in the garage.
s.frame_start=1;s.frame_end=72;s.render.fps=24;s.frame_set(36)
s['parking_design']='P1 / signal teal and canary yellow / exposed services / satin slate epoxy'
s['parking_bays']=31;s['parking_vehicles']=sum(len(v) for v in occupied.values())
s['parking_motorcycles']=4;s['parking_bicycles']=2;s['parking_floor_z']=F
s['parking_brief']='Curved ramp; P1-A08 SUV; P1-B03 charging EV; P1-C11 white sedan; lift 2 central plaza'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'atrium-parking-refined.blend'))
report={'objects':len(s.objects),'new_objects':sum(len(c.objects) for c in collections.values()),'bays':31,'parked_vehicles':s['parking_vehicles'],'two_wheelers':6,'cameras':[o.name for o in collections['Lights'].objects if o.type=='CAMERA']}
(ROOT/'parking-refinement-report.json').write_text(json.dumps(report,indent=2))
print('P1_BUILD_COMPLETE '+json.dumps(report),flush=True)
if '--preview' in sys.argv:
 s.cycles.samples=16;s.cycles.adaptive_threshold=.09;s.render.resolution_x=960;s.render.resolution_y=600
 s.render.filepath=str(ROOT/'parking-refined-preview.png');bpy.ops.render.render(write_still=True)
 print('P1_PREVIEW_COMPLETE',flush=True)
