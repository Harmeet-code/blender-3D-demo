"""Luminary exterior and public realm, preserving four occupied retail floors.

Architectural visualization: named materials and infrastructure are visual design
references, not engineering specifications or certified product ratings.
"""
import ast, bpy, bmesh, math, random, json, sys
from pathlib import Path
from math import sin, cos, pi
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'atrium-parking-refined.blend'))
s=bpy.context.scene
random.seed(117)
for c in list(bpy.data.collections):
    if c.name.startswith('LUM |'):
        for o in list(c.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(c)
groups={}
for name in ['Envelope','Canopy','Public realm','Landscape','Arrival roads','Exterior services','Lighting and cameras']:
    c=bpy.data.collections.new('LUM | '+name);s.collection.children.link(c);groups[name]=c
C=groups['Envelope'];CYL={}
source=ast.parse((ROOT/'refine_parking.py').read_text(encoding='utf-8'))
for node in source.body:
    if isinstance(node,ast.FunctionDef) and node.name in {'mesh','material','texture','box','cyl','rod','curve','torus'}:
        exec(compile(ast.Module(body=[node],type_ignores=[]),str(ROOT/'refine_parking.py'),'exec'))

def group(name):
    global C
    C=groups[name]

def text(name,body,loc,size,ma,rot=(pi/2,0,0),extrude=.005):
    cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.size=size;cu.align_x='CENTER';cu.space_character=1.15
    cu.extrude=extrude;cu.bevel_depth=.001
    cu.font=bpy.data.fonts.load('C:/Windows/Fonts/bahnschrift.ttf')
    o=bpy.data.objects.new(name,cu);C.objects.link(o);o.location=loc;o.rotation_euler=rot;cu.materials.append(ma);return o

def area(name,loc,target,power,color,size=3):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);groups['Lighting and cameras'].objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

def camera(name,loc,target,lens):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);groups['Lighting and cameras'].objects.link(o)
    o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_end=400
    return o

gold=texture(material('LUM champagne anodized aluminium',(.52,.37,.19),.3,.82),180,.00015)
bronze=material('LUM dark bronze reveals',(.065,.038,.018),.28,.76)
steel=material('LUM brushed stainless steel',(.47,.54,.59),.26,.9)
mirror=material('LUM polished canopy stainless',(.68,.73,.77),.12,.94)
white=texture(material('LUM white architectural concrete',(.72,.72,.65),.58),14,.0012)
dark=material('LUM graphite metal',(.012,.019,.026),.32,.58)
yellow=material('LUM tactile ochre iron',(.77,.48,.032),.52,.35)
warm=material('LUM warm recessed linear', (1,.65,.31),.22,emission=4)
letters=material('LUM ivory lettering',(.88,.85,.72),.3,.1,emission=.25)
screen=material('LUM cyan LED display',(.035,.46,.54),.26,emission=1.8)
glass=material('LUM low iron structural glass',(.82,.93,.95),.075)
p=next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Transmission Weight'].default_value=.96;p.inputs['IOR'].default_value=1.45
frit=material('LUM ceramic gradient frit',(.68,.74,.71),.5)
granites=[texture(material('LUM flamed granite '+str(i),(.14+i*.009,.16+i*.009,.17+i*.01),.73),110,.0012) for i in range(4)]
lightstone=texture(material('LUM light granite band',(.47,.48,.46),.65),120,.0009)
terrazzo=texture(material('LUM pale terrazzo seating',(.66,.63,.55),.34),38,.0008)
asphalt=texture(material('LUM asphalt',(.042,.052,.064),.81),85,.0019)
roadpaint=material('LUM lane marking',(.80,.81,.72),.65)
soil=texture(material('LUM planting soil',(.026,.020,.013),.95),35,.014)
bark=texture(material('LUM textured tree bark',(.12,.085,.053),.84),20,.01)
birch=texture(material('LUM silver birch bark',(.59,.58,.5),.85),12,.008)
leaves=[material('LUM foliage '+str(i),c,.73) for i,c in enumerate([(.075,.16,.038),(.15,.24,.062),(.29,.07,.025),(.42,.12,.043)])]
grassmat=material('LUM ornamental grasses',(.26,.29,.11),.83)
onyx=material('LUM translucent onyx header',(.69,.46,.21),.3,emission=.35)
p=next(n for n in onyx.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
noise=onyx.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4;noise.inputs['Roughness'].default_value=.75
ramp=onyx.node_tree.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.3;ramp.color_ramp.elements[0].color=(.16,.073,.022,1)
ramp.color_ramp.elements[1].position=.72;ramp.color_ramp.elements[1].color=(.91,.76,.42,1)
onyx.node_tree.links.new(noise.outputs['Fac'],ramp.inputs[0]);onyx.node_tree.links.new(ramp.outputs[0],p.inputs['Base Color'])

# Remove the section-model title and old branding from the now enclosed exterior.
for o in list(s.objects):
    if o.type=='FONT' and (o.name.startswith(('Project title','Basement section title','Mall identity'))):bpy.data.objects.remove(o,do_unlink=True)
    elif o.name.startswith('Roof sign backdrop'):bpy.data.objects.remove(o,do_unlink=True)

# Four-floor unitized facade, central atrium transparent from plaza to escalators.
for i in range(16):
    x=-15.75+i*2.1
    for level in range(4):
        z=level*4.4+2.18
        # Ground central bays are replaced with the entrance vestibule below.
        if level==0 and abs(x)<4.3:continue
        box('LUM front low iron glazing',(x,-11.43,z),(2.04,.034,4.27),glass,.005)
    box('LUM front unitized mullion',(x-1.05,-11.47,8.8),(.064,.17,17.6),bronze,.008)
box('LUM final front mullion',(16.8,-11.47,8.8),(.064,.17,17.6),bronze,.008)
for z in [0,4.4,8.8,13.2,17.6]:box('LUM front horizontal transom',(0,-11.49,z),(33.6,.17,.07),bronze,.008)
# Side envelopes and angled vertical gold fins establish the new silhouette.
for side in [-1,1]:
    for j in range(11):
        yy=-10.5+j*2.1
        for level in range(4):box('LUM side glazing',(side*16.72,yy,level*4.4+2.18),(.035,2.035,4.26),glass,.004)
        box('LUM side mullion',(side*16.77,yy-1.05,8.8),(.17,.065,17.6),bronze,.007)
        if j%2==0:
            o=box('LUM angled champagne cassette',(side*16.94,yy,9.1),(.26,.70,17.4),gold,.018);o.rotation_euler[2]=side*.35
            box('LUM concealed cassette LED',(side*16.83,yy-.36,9.1),(.04,.025,17.1),warm,.006)
    for z in [0,4.4,8.8,13.2,17.6]:box('LUM side transom',(side*16.78,0,z),(.16,23.1,.065),bronze,.006)
for xx in [-16.4,-14.4,-9.0,9.0,14.4,16.4]:
    o=box('LUM front champagne blade',(xx,-11.76,9.1),(.37,.48,17.4),gold,.025);o.rotation_euler[2]=.27
    box('LUM blade warm grazing seam',(xx+.22,-11.74,9.1),(.025,.04,17.15),warm,.005)
# Real ceramic dots increase in diameter towards the crown; one merged mesh.
v=[];f=[]
for j in range(45):
    z=11.7+j*.13;radius=.009+.025*(j/44)**1.4
    for i in range(251):
        x=-16.25+i*.13;n=len(v)
        v.extend((x+radius*cos(k*pi/3),-11.456,z+radius*sin(k*pi/3)) for k in range(6));f.append(tuple(range(n,n+6)))
mesh('LUM graduated ceramic frit dots',v,f,frit)
box('LUM floating champagne crown',(0,-11.5,18.15),(34.0,.62,1.06),gold,.065)
text('LUM north halo channel letters','THE LUMINARY',(0,-11.85,17.92),.91,steel,extrude=.055)
text('LUM channel-letter back glow','THE LUMINARY',(0,-11.79,17.92),.925,warm,extrude=.001)
text('LUM promenade subtitle','G A L L E R I A   &   P R O M E N A D E',(0,-11.83,17.70),.15,letters)
# Luxury two-storey portals flanking the atrium.
for xx,brand in [(-12,'MAISON'),(12,'ATELIER')]:
    for dx in [-3.1,3.1]:box('LUM anchor bronze reveal',(xx+dx,-11.85,4.3),(.19,.35,8.6),bronze,.02)
    box('LUM anchor backlit onyx',(xx,-11.77,7.67),(6.06,.28,1.20),onyx,.018)
    text('LUM anchor identity',brand,(xx,-11.93,7.53),.40,letters)
    for dx in [-2,-1,0,1,2]:box('LUM structural glass fin',(xx+dx,-11.72,3.35),(.034,.40,6.6),glass,.005)
    area('LUM anchor onyx wash',(xx,-12.1,7.4),(xx,-11.4,6),110,(1,.69,.37),3)

# Transparent airlock vestibule, two revolving doors and an accessible slider.
for xx in [-4.2,4.2]:box('LUM vestibule side',(xx,-12.4,1.7),(.025,2.2,3.4),glass,.003)
box('LUM vestibule header',(0,-13.5,3.45),(8.55,.25,.30),bronze,.026)
for xx in [-2.4,2.4]:
    for zz in [.09,3.18]:cyl('LUM revolving door circular drum',(xx,-12.6,zz),1.02,.09,bronze,64)
    cyl('LUM revolving spindle',(xx,-12.6,1.64),.045,3.08,steel)
    for k in range(3):
        a=k*2*pi/3
        o=box('LUM revolving glass leaf',(xx+.48*cos(a),-12.6+.48*sin(a),1.64),(.96,.025,3.0),glass,.004);o.rotation_euler[2]=a
    for k in range(10):
        a=k*pi/9
        rod('LUM curved drum frame',(xx+1.02*cos(a),-12.6+1.02*sin(a),.13),(xx+1.02*cos(a),-12.6+1.02*sin(a),3.12),.014,bronze)
for xx in [-.48,.48]:box('LUM accessible sliding glass door',(xx,-13.46,1.66),(.94,.025,3.13),glass,.004)
box('LUM air curtain service plenum',(0,-13.0,3.21),(1.95,.28,.22),dark,.024)
for i in range(35):box('LUM air curtain outlet blade',(-.85+i*.05,-13.15,3.13),(.017,.06,.08),steel)
text('LUM entry lettering','WELCOME',(0,-13.67,3.4),.13,letters)

group('Canopy')
# The canopy's rear edge is at y=-11.4 and its centre projects exactly 18m.
NX=24;NY=16
def canopy_point(i,j):
    u=i/NX; t=j/NY;x=(u-.5)*26
    front=-29.4+3.0*(abs(x)/13)**2
    return (x,-11.4+(front+11.4)*t,6.45-.9*t+.20*(x/13)**2)
v=[];f=[]
for j in range(NY+1):
    for i in range(NX+1):v.append(canopy_point(i,j))
for j in range(NY):
    for i in range(NX):
        k=j*(NX+1)+i;f.append((k,k+1,k+NX+2,k+NX+1))
o=mesh('LUM sweeping 18m portico roof',v,f,gold,True);mod=o.modifiers.new('Canopy structural depth','SOLIDIFY');mod.thickness=.26
for j in range(0,NY+1,2):curve('LUM canopy structural rib',[canopy_point(i,j) for i in range(NX+1)],.065,bronze)
for i in range(0,NX+1,2):curve('LUM canopy polished soffit seam',[(x,y,z-.29) for x,y,z in [canopy_point(i,j) for j in range(NY+1)]],.013,bronze)
for j in range(NY):
    for i in range(NX):
        corners=[canopy_point(i,j),canopy_point(i+1,j),canopy_point(i+1,j+1),canopy_point(i,j+1)]
        mesh('LUM mirror soffit tile',[(x,y,z-.28) for x,y,z in corners],[(0,3,2,1)],mirror)
for xx in [-7.4,7.4]:
    cyl('LUM Y-column base',(xx,-23.8,.14),.44,.20,steel,32)
    rod('LUM Y-column stem',(xx,-23.8,.23),(xx,-23.8,2.52),.20,white)
    for yy,zz in [(-28.0,5.34),(-15.4,5.91)]:rod('LUM diagonal canopy Y arm',(xx,-23.8,2.4),(xx,yy,zz),.17,white)
    for a in range(8):cyl('LUM column anchor bolt',(xx+.31*cos(a*pi/4),-23.8+.31*sin(a*pi/4),.25),.018,.04,steel,8)
curve('LUM canopy leading light',[(x,y,z-.14) for x,y,z in [canopy_point(i,NY) for i in range(NX+1)]],.025,warm)
for xx in [-9,-4.5,0,4.5,9]:
    for yy in [-16,-21,-25]:
        zz=6.45-.9*((yy+11.4)/-18)+.2*(xx/13)**2-.31
        cyl('LUM anti glare downlight bezel',(xx,yy,zz),.11,.035,bronze,32)
        cyl('LUM recessed warm downlight',(xx,yy,zz-.018),.065,.01,warm,32)
        area('LUM portico light',(xx,yy,zz-.04),(xx,yy,.05),65,(1,.72,.43),.6)
for xx in [-10.5,10.5]:
    box('LUM acoustic service panel',(xx,-21,5.79),(1.0,3,.03),bronze,.01)
    for k in range(21):box('LUM acoustic microperforation row',(xx-.42+k*.042,-21,5.77),(.008,2.8,.004),dark)

group('Public realm')
box('LUM plaza foundation',(0,-23,-.10),(64,25,.28),white,.04)
# Batched mesh tiles keep the 600mm construction module without thousands of objects.
tileverts=[[] for _ in granites];tilefaces=[[] for _ in granites]
for j in range(40):
    yy=-34.8+j*.6
    for i in range(105):
        xx=-31.5+i*.6+(j%2)*.3
        if xx>31.5:continue
        bucket=(i*7+j*11)%4;vv=tileverts[bucket];ff=tilefaces[bucket];n=len(vv)
        vv.extend([(xx-.296,yy-.296,.048),(xx+.296,yy-.296,.048),(xx+.296,yy+.296,.048),(xx-.296,yy+.296,.048)]);ff.append((n,n+1,n+2,n+3))
for i in range(4):mesh('LUM 600mm staggered granite tiles',tileverts[i],tilefaces[i],granites[i])
for xx in [-26,-18,-10,0,10,18,26]:box('LUM light granite longitudinal band',(xx,-23.1,.054),(.30,24.1,.014),lightstone,.003)
for yy in [-33,-28.2,-23.4,-18.6,-13.8]:box('LUM light granite transverse band',(0,yy,.055),(63,.16,.016),lightstone,.003)
for xx in [-8.4,8.4]:
    box('LUM floor expansion joint',(xx,-23,.063),(.14,24,.018),steel,.004)
    for dx in [-.035,.035]:box('LUM expansion joint gasket',(xx+dx,-23,.075),(.011,24,.005),dark)
box('LUM continuous facade slot drain',(0,-12.0,.061),(33.6,.015,.02),dark)
for xx in [-16,-8,0,8,16]:box('LUM drain maintenance insert',(xx,-12,.063),(.25,.12,.021),steel,.004)
for j in range(67):
    yy=-33.5+j*.3
    box('LUM tactile directional tile',(0,yy,.066),(.59,.29,.034),yellow,.012)
    for dx in [-.19,-.095,0,.095,.19]:box('LUM tactile guide rib',(dx,yy,.089),(.017,.23,.014),yellow,.008)
for xx in [-.6,-.3,0,.3,.6]:
    for yy in [-33.8,-33.5,-33.2]:
        box('LUM tactile warning tile',(xx,yy,.064),(.294,.294,.032),yellow,.01)
        for dx in [-.09,0,.09]:
            for dy in [-.09,0,.09]:cyl('LUM warning dome',(xx+dx,yy+dy,.089),.018,.012,yellow,12)
for xx in range(-30,31,2):
    if abs(xx)<2:continue
    cyl('LUM perimeter steel bollard',(xx,-34.4,.55),.10,1,steel,32)
    torus('LUM bollard machined band',(xx,-34.4,.97),.101,.006,dark)
    cyl('LUM bollard recessed base',(xx,-34.4,.069),.18,.026,dark,32)
for xx in [-2,2]:
    cyl('LUM retractable valet bollard',(xx,-34.4,.30),.11,.52,steel,32)
    cyl('LUM hydraulic ground housing',(xx,-34.4,.066),.22,.022,dark,32)

group('Landscape')
def tree(x,y,h=4.8,maple=False):
    trunkmat=bark if maple else birch
    rod('LUM tree trunk',(x,y,.8),(x+.13,y,h*.77),.075 if maple else .06,trunkmat)
    verts=[];faces=[]
    for k in range(10):
        a=k*2.4;rr=random.uniform(.65,1.45);zz=h*.62+random.random()*h*.30
        end=Vector((x+rr*cos(a),y+rr*sin(a),zz))
        rod('LUM fine branching structure',(x+.09,y,h*.52),end,.024,trunkmat)
        for n in range(480):
            phi=random.uniform(0,2*pi);ct=random.uniform(-1,1);rad=random.random()**(1/3)
            p=end+Vector((cos(phi)*math.sqrt(1-ct*ct)*rad*.93,sin(phi)*math.sqrt(1-ct*ct)*rad*.93,ct*rad*.67))
            sz=random.uniform(.055,.095);a2=random.uniform(0,2*pi)
            u=Vector((cos(a2)*sz,sin(a2)*sz,random.uniform(-.035,.035)));v=Vector((-sin(a2)*sz*.55,cos(a2)*sz*.55,.025))
            idx=len(verts);verts.extend([p-u,p+v,p+u,p-v]);faces.append((idx,idx+1,idx+2,idx+3))
    o=mesh('LUM Japanese maple foliage' if maple else 'LUM silver birch foliage',verts,faces,leaves[2 if maple else 0])
    o.data.materials.append(leaves[3 if maple else 1])
    for p in o.data.polygons:p.material_index=random.randrange(2)

def grasses(x,y,length):
    v=[];f=[]
    for i in range(int(length*120)):
        px=x+random.uniform(-length/2,length/2);py=y+random.uniform(-.65,.65);h=random.uniform(.28,.74);ang=random.uniform(0,2*pi)
        k=len(v);v.extend([(px-.009,py,.82),(px+.009,py,.82),(px+.13*cos(ang),py+.13*sin(ang),.82+h)]);f.append((k,k+1,k+2))
    mesh('LUM layered ornamental grass blades',v,f,grassmat)
for xx,yy,ll,maple in [(-23,-17,10,False),(23,-17,10,False),(-23,-28,10,True),(23,-28,10,True),(-12,-31.3,7,True),(12,-31.3,7,False)]:
    box('LUM terraced white planter',(xx,yy,.44),(ll,2.35,.80),white,.15)
    box('LUM recessed planter soil',(xx,yy,.82),(ll-.32,2.03,.07),soil,.1)
    box('LUM cantilevered terrazzo bench',(xx,yy-1.27,.52),(ll+.25,.64,.12),terrazzo,.055)
    box('LUM bench underside glow',(xx,yy-1.25,.435),(ll-.15,.40,.02),warm,.01)
    for dx in range(-int(ll/2)+1,int(ll/2)):
        cyl('LUM brass anti skate stud',(xx+dx,yy-1.54,.598),.018,.038,gold,16)
    for dx in [-ll*.29,ll*.29]:tree(xx+dx,yy,4.2+random.random(),maple)
    grasses(xx,yy,ll-.5)
    area('LUM planter ground wash',(xx,yy-1.45,.4),(xx,yy-2,.05),24,(1,.62,.29),2)

group('Arrival roads')
# Continuous four-sided road around the building and open-air ramp excavation.
box('LUM foreground approach asphalt',(6,-41,-.04),(92,12,.15),asphalt,.06)
box('LUM west ring road',(-39,0,-.04),(10,76,.15),asphalt,.05)
box('LUM east ring road',(51,0,-.04),(10,76,.15),asphalt,.05)
box('LUM rear ring road',(6,33,-.04),(92,10,.15),asphalt,.05)
for xx in range(-36,53,4):
    box('LUM front lane dash',(xx,-42,.045),(2,.10,.016),roadpaint,.004)
    box('LUM rear lane dash',(xx,33,.045),(2,.10,.016),roadpaint,.004)
for yy in range(-36,38,4):
    for xx in [-39,51]:box('LUM side lane dash',(xx,yy,.045),(.10,2,.016),roadpaint,.004)
for yy in [-35.2,-46.8]:box('LUM ring road edge line',(6,yy,.046),(91,.10,.016),roadpaint)
for xx in [-33.8,45.8]:box('LUM ring road inner edge',(xx,0,.046),(.10,68,.016),roadpaint)
# Curving valet curb and charcoal pavers form a slower foreground branch.
pts=[(-30+60*i/60,-36.6-1.5*sin(pi*i/60),.085) for i in range(61)]
curve('LUM curved valet curb',pts,.09,white)
v=[];f=[]
for j in range(10):
    for i in range(180):
        xx=-30+i/3;yy=-35.1-j*.27-1.5*sin(pi*(xx+30)/60);k=len(v)
        v.extend([(xx,yy,.053),(xx+.327,yy,.053),(xx+.327,yy+.26,.053),(xx,yy+.26,.053)]);f.append((k,k+1,k+2,k+3))
mesh('LUM interlocking valet charcoal pavers',v,f,granites[0])
box('LUM valet podium platform',(4,-28,.14),(2.2,1.45,.19),lightstone,.035)
box('LUM brushed steel valet console',(4,-28, .79),(.68,.55,1.13),steel,.055)
box('LUM valet touchscreen surround',(4,-28.29,1.02),(.54,.035,.40),dark,.022)
box('LUM valet touch display',(4,-28.314,1.04),(.46,.012,.29),screen,.015)
text('LUM valet console title','VALET',(4,-28.325,.68),.10,dark)
for xx in [-29,29]:
    box('LUM six metre wayfinding pylon',(xx,-32.5,3.08),(1.46,.44,6),dark,.08)
    for direction in [-1,1]:
        yy=-32.5+direction*.231;rot=(pi/2,0,0 if direction<0 else pi)
        box('LUM outdoor LED display',(xx,yy,3.28),(1.19,.025,3.72),dark,.022)
        text('LUM pylon identity','LUMINARY',(xx,yy+direction*.025,5.33),.15,letters,rot)
        for body,z,sz,ma in [('P1',4.62,.60,letters),('13 FREE',3.91,.23,screen),('PARKING',3.49,.15,letters),('ENTRY  >',2.91,.18,screen),('VALET',2.15,.18,letters),('OPEN',1.68,.14,screen)]:
            text('LUM parking guidance display',body,(xx,yy+direction*.025,z),sz,ma,rot)
    box('LUM pylon gold cap',(xx,-32.5,6.10),(1.43,.44,.07),gold,.018)
for xx in [-30,30]:
    cyl('LUM promenade light pole',(xx,-39,3.6),.075,7.15,dark)
    box('LUM light pole head',(xx,-39,7.18),(1.25,.35,.10),dark,.06)
    area('LUM road lantern',(xx,-39,7.1),(xx,-39,.1),220,(1,.77,.52),1)

group('Exterior services')
fdcred=material('LUM red fire hardware',(.50,.025,.009),.29,.4)
for xx in [-15,15]:
    box('LUM FDC recessed cabinet',(xx,-11.69,.83),(.65,.16,.86),steel,.025)
    text('LUM FDC legend','FDC',(xx,-11.785,1.09),.11,fdcred)
    for dx in [-.16,.16]:
        o=cyl('LUM Siamese fire connection',(xx+dx,-11.84,.79),.066,.22,steel,32);o.rotation_euler[0]=pi/2
        o=cyl('LUM red FDC cap',(xx+dx,-11.96,.79),.073,.045,fdcred,32);o.rotation_euler[0]=pi/2
        curve('LUM fire cap retaining chain',[(xx+dx,-11.99,.75),(xx+dx+.06,-11.98,.57),(xx+dx+.12,-11.84,.67)],.005,steel)
    box('LUM emergency key box',(xx+.53,-11.75,1.38),(.23,.13,.27),steel,.02)
    box('LUM recessed emergency pull station',(xx-.48,-11.75,1.34),(.20,.10,.24),fdcred,.015)
    text('LUM alarm label','FIRE',(xx-.48,-11.81,1.39),.042,letters)
box('LUM rear service enclosure',(0,15,1.7),(24,6,3.35),white,.05)
for xx in [-8,0,8]:
    box('LUM acoustic louver backing',(xx,18.08,1.65),(6.4,.12,2.7),dark,.025)
    for j in range(23):
        o=box('LUM service acoustic louver',(xx,18.18,.36+j*.113),(6.25,.20,.05),bronze,.008);o.rotation_euler[0]=.35
for xx in [-5,5]:
    cyl('LUM generator exhaust stack',(xx,16,4.3),.20,2.9,steel,32)
    cyl('LUM exhaust weather cowl',(xx,16,5.78),.34,.16,dark,32)
box('LUM living wall support',(0,20,1.55),(28,.18,3),dark,.03)
v=[];f=[]
for i in range(6000):
    xx=random.uniform(-13.9,13.9);zz=random.uniform(.15,2.95);yy=19.83-random.random()*.12;rr=random.uniform(.045,.09);k=len(v)
    v.extend([(xx-rr,yy,zz),(xx,yy-.035,zz+rr*1.4),(xx+rr,yy,zz),(xx,yy-.015,zz-rr)]);f.append((k,k+1,k+2,k+3))
o=mesh('LUM three metre ivy screen',v,f,leaves[0]);o.data.materials.append(leaves[1])
for p in o.data.polygons:p.material_index=random.randrange(2)

# Deliberate twilight: warm interiors and metalwork against a cool sky.
# Complete ground around the open ramp; no blanket plane across its excavation.
group('Public realm')
for x,y,w,d in [(-49,0,142,220),(83.5,0,73,220),(34.5,-60,25,100),(34.5,65,25,90)]:
    box('LUM continuous surrounding grade',(x,y,-.24),(w,d,.12),granites[1])
group('Envelope')
for xx in [-14.4,-11.2,-8,-4.8,-1.6,1.6,4.8,8,11.2,14.4]:
    box('LUM low iron atrium roof glazing',(xx,-3.05,17.73),(3.14,16.1,.028),glass,.004)
for light in s.objects:
    if light.type=='LIGHT':
        # Lighting rigs illuminate the scene without appearing as giant discs
        # reflected in every curtain-wall pane; physical luminous fittings stay.
        light.visible_glossy=False
        light.visible_transmission=False
        if light.data.type=='POINT':light.data.specular_factor=0
bg=next(n for n in s.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.20,.30,.48,1);bg.inputs[1].default_value=.32
sun=bpy.data.objects.get('Late afternoon sun')
if sun:
    sun.data.energy=.8;sun.data.color=(1,.70,.43);sun.data.angle=.09
    sun.rotation_euler=Vector((.5,.55,-.18)).to_track_quat('-Z','Y').to_euler()
area('LUM twilight softbox',(0,-30,27),(0,-5,8),2600,(.50,.67,1),24)
for level in range(4):
    for xx in [-11,11]:area('LUM facade interior glow',(xx,-7,level*4.4+3.3),(xx,-11,level*4.4+1.5),140,(1,.73,.43),3)
camera('LUM | Twilight exterior',(48,-67,26),(0,-8,6.8),40)
camera('LUM | Promenade arrival',(-24,-43,3.1),(0,-9,8),29)
camera('LUM | Canopy craftsmanship',(11,-31,2.0),(0,-15,4.1),25)
camera('LUM | Rear service court',(31,32,10),(0,13,3),35)
s.camera=bpy.data.objects['LUM | Twilight exterior'];s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.use_denoising=True
s.cycles.samples=48;s.cycles.adaptive_threshold=.035;s.render.resolution_x=1800;s.render.resolution_y=1200;s.render.resolution_percentage=100
s['design']='THE LUMINARY GALLERIA & PROMENADE / four retail floors / refined P1 / twilight'
s['retail_floor_count']=4;s['parking_vehicle_count']=18;s['exterior_canopy_projection_m']=18
assert len([o for o in s.objects if o.type=='EMPTY' and o.name.startswith('P1-')])==18
assert len([o for o in s.objects if o.name.startswith('Bay status ')])==31
assert 'Protected teal pedestrian approach' in bpy.data.objects
report={'retail_floors':4,'parking_vehicles':18,'parking_bays':31,'canopy_projection_m':18,
        'name':'The Luminary Galleria & Promenade','exterior_collections':list(groups),
        'pylon_free_bays':13,'model_units':'metres','time_of_day':'twilight'}
(ROOT/'luminary-exterior-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'luminary-galleria.blend'))
print('LUMINARY_SAVED '+json.dumps(report),flush=True)
if '--preview' in sys.argv:
    s.cycles.samples=16;s.cycles.adaptive_threshold=.09;s.render.resolution_x=1050;s.render.resolution_y=700
    for name,file in [('LUM | Twilight exterior','luminary-exterior-preview'),('LUM | Promenade arrival','luminary-promenade-preview'),('LUM | Canopy craftsmanship','luminary-canopy-preview')]:
        s.camera=bpy.data.objects[name];s.render.filepath=str(ROOT/(file+'.png'));bpy.ops.render.render(write_still=True)
        print('LUMINARY_PREVIEW '+file,flush=True)
