"""Replace the P1 fleet with six distinct, dimensioned automotive assemblies.

Run after refine_parking.py / finalize_parking.py. The reviewed garage is the
input; architecture, bay occupancy, charging equipment and pedestrian route stay
in place. Shared master meshes keep repeated vehicles editable and economical.
"""
import ast
import bpy
import bmesh
import json
import math
import sys
from collections import Counter
from pathlib import Path
from math import sin, cos, pi
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'atrium-parking-refined.blend'))
s = bpy.context.scene
F = s['parking_floor_z']
C = bpy.data.collections['P1 | Vehicles']
CYL = {}
# Reuse only geometry helpers, never execute the garage generator's scene edits.
source = ast.parse((ROOT / 'refine_parking.py').read_text(encoding='utf-8'))
for node in source.body:
    if isinstance(node, ast.FunctionDef) and node.name in {
        'mesh', 'material', 'texture', 'box', 'cyl', 'rod', 'curve', 'torus'
    }:
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(ROOT / 'refine_parking.py'), 'exec'))

black = material('V2 satin polymer', (.012, .017, .021), .42, .12)
rubber = texture(material('V2 tyre rubber', (.013, .015, .018), .8), 115, .00045)
chrome = material('V2 satin diamond-cut alloy', (.49, .54, .58), .23, .94)
darkmetal = material('V2 anthracite alloy', (.037, .046, .055), .26, .85)
brake = material('V2 iron brake rotor', (.22, .24, .25), .42, .85)
red = material('V2 brake caliper', (.42, .033, .016), .3, .5)
glass = material('V2 solar glass', (.025, .049, .063), .13, .2, coat=.75)
next(n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Transmission Weight'].default_value = .16
lampglass = material('V2 optical lens', (.15, .23, .29), .09, .5, coat=1)
lampwhite = material('V2 LED signature', (.78, .88, 1), .2, emission=.8)
lampred = material('V2 ruby tail lens', (.38, .006, .009), .16, .25, emission=.12, coat=1)
amber = material('V2 amber reflector', (.8, .21, .015), .2, .2)
seat = material('V2 stitched charcoal upholstery', (.025, .031, .033), .77)
plate = material('V2 registration enamel', (.78, .81, .77), .36)
paint_mats = {}
for name, color in {
    'Midnight blue': (.017, .071, .16), 'Pearl white': (.74, .76, .72),
    'Platinum silver': (.43, .51, .58), 'Desert bronze': (.24, .14, .071),
    'Forest green': (.042, .12, .082), 'Graphite': (.055, .067, .082),
    'Burgundy': (.23, .021, .035), 'Service ivory': (.69, .7, .64)
}.items():
    paint_mats[name] = texture(material('V2 paint / ' + name, color, .235, .62, coat=.8), 220, .000055, (.20, .255))

def finish(o, radius=.025):
    if radius:
        m = o.modifiers.new('Panel edge radius', 'BEVEL'); m.width = radius; m.segments = 3
    m = o.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL'); m.keep_sharp = True
    return o

def recalc(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()

def boolean(o, cutter):
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('Manufactured opening', 'BOOLEAN')
    m.operation = 'DIFFERENCE'; m.solver = 'EXACT'; m.object = cutter
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

def loft(name, sections, w, ma):
    # Rounded shoulders and recessed sill: twelve stations across the body,
    # longitudinal stations controlling the nose, fenders and rear overhang.
    v = []; faces = []
    for y, factor, h in sections:
        profile = [(-.80*w, .34), (-.94*w, .45), (-w, .63), (-w, h-.16),
                   (-.97*w, h-.035), (-.83*w, h+.015), (-.52*w, h+.038),
                   (0, h+.05), (.52*w, h+.038), (.83*w, h+.015),
                   (.97*w, h-.035), (w, h-.16), (w, .63), (.94*w, .45), (.80*w, .34)]
        v.extend((x*factor, y, z) for x, z in profile)
    n = 15
    for j in range(len(sections)-1):
        for i in range(n): faces.append((j*n+i, j*n+(i+1)%n, (j+1)*n+(i+1)%n, (j+1)*n+i))
    faces += [tuple(reversed(range(n))), tuple(range((len(sections)-1)*n, len(sections)*n))]
    o = mesh(name, v, faces, ma, True); recalc(o)
    return o

def bowed_panel(name, corners, ma, bow=.035):
    a, b, c, d = map(Vector, corners)
    v = []; f = []; nx = 16; ny = 5
    normal = (b-a).cross(d-a).normalized()
    for j in range(ny+1):
        t = j/ny
        for i in range(nx+1):
            u = i/nx
            p = (a*(1-u)+b*u)*(1-t) + (d*(1-u)+c*u)*t
            p += normal * (bow*sin(pi*u)*sin(pi*t))
            v.append(p)
    for j in range(ny):
        for i in range(nx):
            k = j*(nx+1)+i; f.append((k, k+1, k+nx+2, k+nx+1))
    return mesh(name, v, f, ma, True)

SPECS = {
    'Sedan': (4.74, 1.87, 1.49, 1.035, .355, -1.46, 1.40, -1.10, -.43, .74, 1.55),
    'EV': (4.76, 1.89, 1.53, 1.055, .37, -1.47, 1.45, -1.20, -.49, .75, 1.64),
    'SUV': (4.94, 1.99, 1.85, 1.16, .405, -1.52, 1.47, -1.15, -.63, 1.37, 2.03),
    'Pickup': (5.38, 2.00, 1.88, 1.19, .414, -1.68, 1.63, -1.48, -.88, .70, 1.04),
    'Utility van': (5.04, 1.98, 2.10, 1.15, .375, -1.48, 1.48, -1.70, -1.20, 2.17, 2.39),
    'Wagon': (4.88, 1.88, 1.59, 1.065, .372, -1.48, 1.47, -1.14, -.5, 1.40, 2.05),
}

def wheel(kind, side, yy, w, radius):
    zc = radius-.005; x = side*(w-.06)
    # Revolved tyre section has a flat tread band, rounded shoulder and
    # recessed sidewall, unlike a doughnut-shaped primitive.
    prof = [(-.132,.73),(-.145,.82),(-.144,.91),(-.115,.98),(-.08,1),
            (.08,1),(.115,.98),(.144,.91),(.145,.82),(.132,.73),(.10,.70),(-.10,.70)]
    verts = []; faces = []; n = 80
    for i in range(n):
        a=2*pi*i/n
        for ax, rr in prof: verts.append((x+ax, yy+radius*rr*cos(a), zc+radius*rr*sin(a)))
    for i in range(n):
        for j in range(len(prof)):
            faces.append((i*12+j, ((i+1)%n)*12+j, ((i+1)%n)*12+(j+1)%12, i*12+(j+1)%12))
    o=mesh(kind+' pneumatic tyre', verts, faces, rubber, True); recalc(o)
    outer=side*(w+.089); rimr=radius*.735
    for rr in [.83,.90]: torus(kind+' moulded sidewall ring',(outer,yy,zc),radius*rr,.0025,rubber,(0,pi/2,0),64)
    # Fine circumferential grooves read in grazing light without over-scaling.
    for dx in [-.055,0,.055]:
        torus(kind+' tread channel',(x+dx,yy,zc),radius-.001,.002,black,(0,pi/2,0),80)
    disc=cyl(kind+' ventilated brake disc',(outer-side*.055,yy,zc),rimr*.79,.025,brake,64); disc.rotation_euler[1]=pi/2
    barrel=cyl(kind+' recessed alloy barrel',(outer-side*.038,yy,zc),rimr,.055,darkmetal,64);barrel.rotation_euler[1]=pi/2
    # Rotor lies in front of the dark barrel, behind the machined spokes.
    disc.location.x=outer-side*.021
    torus(kind+' diamond cut rim lip',(outer+side*.009,yy,zc),rimr,.014,chrome,(0,pi/2,0),64)
    for j in range(6 if kind in ['Pickup','Utility van'] else 5):
        count=6 if kind in ['Pickup','Utility van'] else 5
        a=j*2*pi/count
        for da in [-.07,.07]:
            start=(outer,yy+.065*cos(a),zc+.065*sin(a)); end=(outer,yy+rimr*.95*cos(a+da),zc+rimr*.95*sin(a+da))
            rod(kind+' sculpted alloy spoke',start,end,.018,chrome)
        bolt=cyl(kind+' wheel lug',(outer+side*.015, yy+.043*cos(a),zc+.043*sin(a)),.009,.016,darkmetal,12);bolt.rotation_euler[1]=pi/2
    hub=cyl(kind+' hub centre',(outer,yy,zc),.063,.025,darkmetal,32);hub.rotation_euler[1]=pi/2
    box(kind+' caliper',(outer-side*.002,yy+rimr*.62,zc),(.035,.062,.15),red,.016)
    rod(kind+' valve stem',(outer,yy-rimr*.86,zc),(outer+side*.03,yy-rimr*.86,zc),.007,black)

def vehicle(kind, ma):
    start=set(C.objects)
    length,width,top,belt,radius,frontax,rearax,front,rf,rr,rear = SPECS[kind]
    w=width/2; half=length/2; rw=w*(.86 if kind=='Utility van' else .78)
    util=kind in ['SUV','Pickup','Utility van','Wagon']
    sections=[(-half,.87,belt-.17),(-half+.10,.94,belt-.10),(-half+.3,.986,belt-.025),
              (frontax,1,belt+.012),(front,1,belt),(0,1,belt-.008),
              (rearax,1,belt),(half-.32,.985,belt-.045),(half-.12,.95,belt-.09),(half,.88,belt-.14)]
    sections=sorted(sections)
    body=loft(kind+' continuous sculpted body',sections,w,ma)
    for yy in [frontax,rearax]:
        cutter=cyl('Wheel opening cutter',(0,yy,radius-.005),radius+.069,width+.7,black,64);cutter.rotation_euler[1]=pi/2
        boolean(body,cutter)
    if kind=='Pickup':
        cutter=box('Open bed cutter',(0,1.85,1.69),(1.61,1.46,1.72),black,.035)
        boolean(body,cutter)
    finish(body,.027)
    # Explicit flat door skins prevent boolean wheel openings from pulling
    # shading across long, nearly planar side panels.
    for side in [-1,1]:
        for y1,y2 in [(frontax+radius+.09,.11),(.13,rearax-radius-.09)]:
            if y2-y1>.12:
                panel=box(kind+' pressed door skin',(side*(w+.005),(y1+y2)/2,(.55+belt-.18)/2),(.021,y2-y1-.018,belt-.18-.55),ma,.018)
    # Cambered roof panel, with supported edges to preserve a subtle highlight.
    roofcorners=[(-rw,rf,top-.04),(rw,rf,top-.04),(rw,rr,top-.035),(-rw,rr,top-.035)]
    roof=bowed_panel(kind+' gently crowned roof',roofcorners,ma,.055)
    m=roof.modifiers.new('Roof panel thickness','SOLIDIFY');m.thickness=.035
    finish(roof,.02)
    fw=w*.89; bw=w*.89
    windshield=[(-fw,front,belt+.035),(fw,front,belt+.035),(rw,rf,top-.066),(-rw,rf,top-.066)]
    bowed_panel(kind+' curved laminated windscreen',windshield,glass,-.037)
    curve(kind+' windscreen rubber seal',windshield,.014,black,True)
    if kind!='Utility van':
        back=[(-rw,rr,top-.07),(rw,rr,top-.07),(bw,rear,belt+.035),(-bw,rear,belt+.035)]
        bowed_panel(kind+' curved rear screen',back,glass,.025)
        curve(kind+' rear glass seal',back,.014,black,True)
        for n in range(7):
            t=.2+n*.08; yy=rr*(1-t)+rear*t; zz=(top-.07)*(1-t)+(belt+.035)*t
            ww=rw*(1-t)+bw*t
            rod(kind+' rear defroster',(-ww*.87,yy+.006,zz),(ww*.87,yy+.006,zz),.0017,darkmetal)
    for side in [-1,1]:
        lower1=(side*fw,front,belt+.025); upper1=(side*rw,rf,top-.05)
        upper2=(side*rw,rr,top-.05); lower2=(side*bw,rear,belt+.025)
        # Vans have metal cargo sides and only a glazed front cab.
        if kind=='Utility van':
            sidepanel=[lower1,upper1,upper2,lower2]
            mesh('Utility van solid cargo side',sidepanel,[(0,1,2,3)],ma)
            cab=[(side*(fw+.015),front+.09,belt+.08),(side*(rw+.013),rf+.08,top-.13),
                 (side*(rw+.013),-.12,top-.13),(side*(fw+.015),-.12,belt+.08)]
            mesh('Utility van front door glass',cab,[(0,1,2,3)],glass)
            curve('Utility van cab glass gasket',cab,.018,black,True)
            curve('Utility van sliding cargo door seam',[(side*(w+.005),-.02,.48),(side*(w+.005),-.02,belt),
                (side*(rw+.012),-.02,top-.10),(side*(rw+.012),1.94,top-.10),(side*(w+.005),2.13,.48)],.0045,black)
            rod('Utility van sliding door track',(side*(w+.012),.15,belt-.15),(side*(w+.012),2.05,belt-.15),.016,black)
        else:
            sidepts=[lower1,upper1,upper2,lower2]
            mesh(kind+' fitted side glazing',sidepts,[(0,1,2,3)],glass)
            curve(kind+' bright window perimeter',sidepts,.012,chrome,True)
            mid=-.08 if kind=='Pickup' else .22
            rod(kind+' black B pillar',(side*fw,mid,belt+.025),(side*rw,mid,top-.05),.045,black)
            if kind in ['SUV','Wagon']:
                rod(kind+' quarter window pillar',(side*fw,1.20,belt+.025),(side*rw,1.01,top-.05),.034,black)
        rod(kind+' structural A pillar',lower1,upper1,.046,ma)
        rod(kind+' structural rear pillar',upper2,lower2,.058 if kind!='Utility van' else .035,ma)
        rod(kind+' roof side rail',upper1,upper2,.027,ma)
        for yy in ([-.18,.86] if kind not in ['Pickup','Utility van'] else [-.28,.64]):
            box(kind+' recessed handle pocket',(side*(w+.004),yy,belt-.13),(.018,.26,.071),black,.025)
            box(kind+' satin door handle',(side*(w+.021),yy-.015,belt-.12),(.035,.21,.026),chrome,.012)
            if kind!='Utility van':
                end=min(yy+.38,rear-.03)
                curve(kind+' door shut gap',[(side*(w*.976),end,belt-.035),(side*(w+.003),end,.69),
                    (side*(w*.951),end-.055,.47)],.0035,black)
        # Hood shut lines and a subtle pressed swage bring scale to broad panels.
        curve(kind+' bonnet panel gap',[(side*w*.77,-half+.22,belt-.035),
              (side*w*.79,frontax,belt+.047),(side*w*.78,front+.06,belt+.035)],.003,black)
        rod(kind+' shoulder character crease',(side*w,front+.18,belt-.10),(side*w,rear-.15,belt-.10),.004,ma)
        box(kind+' rocker sill',(side*w,0,.40),(.075,2.16,.14),black,.032)
        if kind in ['SUV','Pickup']:
            box(kind+' aluminium running board',(side*(w+.065),0,.31),(.18,2.17,.06),darkmetal,.023)
            for dx in [-.025,.025]:rod(kind+' step anti slip strip',(side*(w+.065)+dx,-.93,.346),(side*(w+.065)+dx,.93,.346),.005,black)
        my=front+.24; mz=belt+.21
        rod(kind+' mirror pedestal',(side*fw,my,belt+.1),(side*(w+.13),my,mz),.027,black)
        box(kind+' aero mirror housing',(side*(w+.20),my,mz),(.27,.28,.15),ma,.064)
        box(kind+' mirror reflective insert',(side*(w+.20),my+.144,mz),(.22,.009,.104),chrome,.025)
        box(kind+' mirror turn signal',(side*(w+.20),my-.143,mz-.015),(.21,.009,.019),plate,.007)
        for yy in [frontax,rearax]:
            arc=[(side*(w+.008),yy+(radius+.07)*cos(i*pi/32),radius-.005+(radius+.07)*sin(i*pi/32)) for i in range(33)]
            curve(kind+' fitted wheel arch moulding',arc,.026 if util else .012,black if util else ma)
            wheel(kind,side,yy,w,radius)
        # Flush fuel door, distinct from the live charging port on B03.
        if side==1 and kind!='EV':
            fuel=[(side*(w+.008),rearax+d,belt-.15+z) for d,z in [(-.11,-.07),(.11,-.07),(.11,.10),(-.11,.10)]]
            curve(kind+' fuel flap perimeter',fuel,.0028,black,True)
    for xx in [-.45,.45]:
        box(kind+' leather seat cushion',(xx,front+.85,.88),(.48,.50,.13),seat,.07)
        box(kind+' front seat back',(xx,front+1.06,1.15),(.49,.17,.56),seat,.07)
        box(kind+' padded head restraint',(xx,front+1.09,min(top-.23,1.55)),(.24,.13,.18),seat,.05)
    box(kind+' dashboard',(0,front+.22,belt-.02),(1.50,.30,.17),seat,.035)
    torus(kind+' leather steering wheel',(-.43,front+.48,belt+.16),.15,.019,black,(pi/3,0,0),32)
    for xx in [-.53,.28]:rod(kind+' windshield wiper',(xx,front-.013,belt+.053),(xx+.39,front+.13,belt+.16),.007,black)
    # Complete front fascia: radiused grille, intake, projectors and signatures.
    nose=-half-.022
    box(kind+' front lower valance',(0,nose+.01,.44),(width*.81,.11,.18),black,.055)
    box(kind+' front radiator grille',(0,nose,.78),(width*.42,.065,.29),black,.045)
    if kind!='EV':
        for k in range(4):box(kind+' grille horizontal blade',(0,nose-.041,.67+k*.065),(width*.37,.017,.014),chrome,.006)
    else:box('EV closed aero nose',(0,nose-.04,.79),(width*.42,.04,.27),ma,.06)
    for side in [-1,1]:
        xx=side*width*.315; hz=belt-.16
        box(kind+' headlamp outer gasket',(xx,nose+.018,hz),(.57,.035,.175),black,.045)
        box(kind+' smoked headlamp lens',(xx,nose-.010,hz),(.53,.022,.145),lampglass,.032)
        for dx in [-.135,.055]:
            pr=cyl(kind+' optical projector',(xx+dx,nose-.025,hz),.048,.014,chrome,32);pr.rotation_euler[0]=pi/2
            pr=cyl(kind+' projector glass',(xx+dx,nose-.035,hz),.035,.01,lampglass,32);pr.rotation_euler[0]=pi/2
        curve(kind+' shaped LED signature',[(xx-.22,nose-.030,hz+.056),(xx+.21,nose-.030,hz+.056),(xx+.23,nose-.030,hz-.025)],.009,lampwhite)
        box(kind+' fog lamp recess',(side*width*.34,nose+.01,.53),(.22,.04,.08),black,.023)
        box(kind+' fog optic',(side*width*.34,nose-.014,.53),(.12,.014,.025),lampglass,.01)
        # Vertical truck lamps; long narrow lenses on passenger vehicles.
        dims=(.13,.07,.36) if kind in ['Pickup','Utility van'] else (.55,.07,.095)
        box(kind+' ruby rear lamp',(side*width*.34,half+.018,belt-.15),dims,lampred,.032)
        box(kind+' rear reverse lamp',(side*width*.34,half+.058,belt-.23),(.10,.014,.035),plate,.009)
        box(kind+' rear bumper reflector',(side*width*.36,half+.025,.48),(.16,.02,.035),lampred,.012)
    box(kind+' rear bumper',(0,half,.42),(width*.87,.14,.16),black,.045)
    for face in [-1,1]:
        yy=face*(half+.077)
        box(kind+' registration plinth',(0,yy,.61),(.55,.025,.13),black,.012)
        box(kind+' registration plate',(0,yy+face*.014,.61),(.49,.006,.099),plate,.006)
        for xx in [-.2,.2]:
            screw=cyl(kind+' plate fastener',(xx,yy+face*.02,.61),.007,.006,chrome,12);screw.rotation_euler[0]=pi/2
        for xx in [-.64,-.37,.37,.64]:
            sen=cyl(kind+' ultrasonic bumper sensor',(xx,face*(half+.08),.45),.014,.008,black,20);sen.rotation_euler[0]=pi/2
    if kind in ['SUV','Wagon']:
        for xx in [-rw*.88,rw*.88]:
            for yy in [rf+.28,rr-.21]:box(kind+' roof rail foot',(xx,yy,top+.025),(.07,.14,.07),black,.025)
            rod(kind+' satin roof rail',(xx,rf+.22,top+.075),(xx,rr-.15,top+.075),.021,chrome)
        box(kind+' rear roof spoiler',(0,rr+.075,top-.02),(rw*2+.035,.23,.065),ma,.033)
    if kind=='Pickup':
        box('Pickup ribbed bed liner',(0,1.85,.84),(1.58,1.42,.06),black,.035)
        for xx in [-.62,-.46,-.30,-.14,.02,.18,.34,.50,.66]:
            box('Pickup bed pressed ridge',(xx,1.86,.879),(.046,1.29,.015),darkmetal,.006)
        for side in [-1,1]:
            box('Pickup inner bed wall',(side*.807,1.84,1.035),(.032,1.43,.37),black,.02)
            box('Pickup bed rail cap',(side*.91,1.84,1.19),(.16,1.49,.035),black,.015)
            box('Pickup wheel tub',(side*.69,1.65,.95),(.26,.87,.28),black,.10)
            for yy in [1.22,2.43]:torus('Pickup cargo tie down',(side*.78,yy,1.075),.032,.006,chrome,(0,pi/2,0),24)
        box('Pickup bed front bulkhead',(0,1.105,1.015),(1.61,.045,.35),black,.018)
        box('Pickup tailgate handle',(0,half+.021,1.02),(.25,.034,.067),black,.018)
        curve('Pickup tailgate shut line',[(-.80,half+.01,1.15),(-.80,half+.027,.75),(.80,half+.027,.75),(.80,half+.01,1.15)],.004,black)
        box('Pickup rear step',(0,half+.10,.35),(1.4,.23,.07),darkmetal,.022)
        rod('Pickup tow hitch stem',(0,half,.24),(0,half+.26,.24),.036,darkmetal)
    if kind=='Utility van':
        box('Utility van rear cargo doors',(0,half-.035,1.58),(1.77,.11,1.04),ma,.06)
        rod('Utility van rear door centre seam',(0,half+.025,1.11),(0,half+.025,2.06),.004,black)
        for xx in [-.14,.14]:box('Utility van rear door handle',(xx,half+.037,1.3),(.04,.032,.16),black,.01)
        for yy in [-.82,1.46]:
            box('Utility van roof rack crossbar',(0,yy,top+.075),(1.72,.055,.055),chrome,.012)
            for xx in [-.77,.77]:box('Utility van roof rack foot',(xx,yy,top+.023),(.07,.13,.07),black,.018)
        # Low aluminium service ladder secured to rack, clear of 2.4 m portal.
        for xx in [-.30,.30]:box('Utility van ladder stile',(xx,.3,top+.134),(.045,2.50,.06),chrome,.008)
        for k in range(9):box('Utility van ladder rung',(0,-.84+k*.285,top+.134),(.60,.033,.04),chrome,.006)
        for yy in [-.65,1.25]:box('Utility van cargo securing strap',(0,yy,top+.168),(.69,.032,.014),black,.005)
    if kind=='EV':
        box('EV charge socket backing',(-1.003,.93,1.035),(.031,.16,.16),black,.035)
    return list(set(C.objects)-start)

# Preserve the occupied bay transforms. New archetypes replace selected cars
# rather than putting vehicles into the pedestrian or fire-service route.
roots=sorted([o for o in C.objects if o.type=='EMPTY' and o.name.startswith('P1-')], key=lambda o:o.name)
transforms={o.name[:6]:o.matrix_world.copy() for o in roots}
for o in list(C.objects): bpy.data.objects.remove(o, do_unlink=True)
fleet={
    'P1-A01':('Utility van','Service ivory'), 'P1-A03':('Sedan','Burgundy'),
    'P1-A04':('Wagon','Platinum silver'), 'P1-A06':('SUV','Forest green'),
    'P1-A08':('SUV','Midnight blue'), 'P1-A09':('Sedan','Graphite'),
    'P1-A11':('Pickup','Desert bronze'),
    'P1-B01':('Wagon','Pearl white'), 'P1-B03':('EV','Platinum silver'),
    'P1-B05':('SUV','Graphite'), 'P1-B06':('Pickup','Forest green'),
    'P1-B08':('Utility van','Service ivory'), 'P1-B10':('SUV','Pearl white'),
    'P1-C02':('Sedan','Platinum silver'), 'P1-C04':('SUV','Desert bronze'),
    'P1-C05':('Pickup','Midnight blue'), 'P1-C07':('Sedan','Graphite'),
    'P1-C11':('Sedan','Pearl white')
}
assert set(transforms)==set(fleet), (list(transforms),list(fleet))
masters={}
basepaint=paint_mats['Midnight blue']
for kind in SPECS:
    masters[kind]=vehicle(kind,basepaint)
    print('VEHICLE_MASTER '+kind+' '+str(len(masters[kind])),flush=True)
for code,(kind,color) in fleet.items():
    root=bpy.data.objects.new(code+' '+kind,None);C.objects.link(root)
    root.matrix_world=transforms[code];root['vehicle_class']=kind;root['paint']=color
    root['overall_length_m']=SPECS[kind][0];root['body_width_m']=SPECS[kind][1]
    for src in masters[kind]:
        o=src.copy();o.data=src.data;C.objects.link(o);o.parent=root
        for slot in o.material_slots:
            if slot.material==basepaint:slot.link='OBJECT';slot.material=paint_mats[color]
    # Actual type on registration makes the small plate a useful scale cue.
    for side in [-1,1]:
        cu=bpy.data.curves.new(code+' registration text','FONT');cu.body=code.replace('P1-','AT ');cu.size=.065;cu.align_x='CENTER'
        cu.materials.append(black)
        o=bpy.data.objects.new(code+' registration lettering',cu);C.objects.link(o);o.parent=root
        o.location=(0,side*(SPECS[kind][0]/2+.097),.585)
        o.rotation_euler=(pi/2,0,0 if side<0 else pi)
for parts in masters.values():
    for o in parts:bpy.data.objects.remove(o,do_unlink=True)

def camera(name,loc,target,lens):
    o=bpy.data.objects.get(name)
    if o is None:
        d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);s.collection.objects.link(o)
    o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    o.data.lens=lens;o.data.clip_start=.08;o.data.clip_end=250
    return o
camera('P1 | Pickup craftsmanship',(20.1,-8.0,F+2.38),(16.9,-13.7,F+.98),40)
camera('P1 | Utility fleet',(2.0,-5.4,F+1.90),(5.0,.3,F+1.10),32)
camera('P1 | SUV portrait',(17.9,-5.0,F+1.48),(13.6,0,F+.91),46)
s.camera=bpy.data.objects['P1 | Cinematic aisle']
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.use_denoising=True
s.cycles.samples=48;s.cycles.adaptive_threshold=.035
s.render.resolution_x=1600;s.render.resolution_y=1000;s.render.resolution_percentage=100
s.frame_set(36);bpy.context.view_layer.update()

# Fresh geometry-level contact and entry clearance checks, not just object counts.
tyres=[o for o in C.objects if 'pneumatic tyre' in o.name]
contact_errors=[]
for o in tyres:
    clearance=min((o.matrix_world@v.co).z for v in o.data.vertices)-F
    if abs(clearance)>.008:contact_errors.append((o.name,clearance))
heights={}
for o in C.objects:
    if o.type=='EMPTY':
        verts=[o.matrix_world.inverted()@p.matrix_world@v.co for p in o.children if p.type=='MESH' for v in p.data.vertices]
        heights[o.name]=round(max(v.z for v in verts)+.005,3)
assert len(tyres)==72 and not contact_errors,contact_errors
assert max(heights.values())<2.4,heights
assert s['retail_floor_count']==4
report={'vehicle_count':len(fleet),'types':dict(Counter(k for k,c in fleet.values())),
        'wheel_contacts_checked':len(tyres),'contact_errors':contact_errors,
        'maximum_vehicle_height_m':max(heights.values()),'entry_clearance_m':2.4,
        'retail_floors_retained':4,'bay_occupancy_unchanged':True,'fleet':fleet}
(ROOT/'vehicle-refinement-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
s['vehicle_refinement']='Six distinct vehicle classes; detailed fitted assemblies; October 2026'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'atrium-parking-refined.blend'))
print('VEHICLES_VALIDATED '+json.dumps(report),flush=True)
if '--preview' in sys.argv:
    s.cycles.samples=16;s.cycles.adaptive_threshold=.09
    s.render.resolution_x=960;s.render.resolution_y=600
    for name,filename in [('P1 | Cinematic aisle','parking-vehicles-hero-preview'),('P1 | Pickup craftsmanship','parking-pickup-preview'),('P1 | Utility fleet','parking-utility-preview'),('P1 | SUV portrait','parking-suv-preview')]:
        s.camera=bpy.data.objects[name];s.render.filepath=str(ROOT/(filename+'.png'))
        bpy.ops.render.render(write_still=True)
        print('PREVIEW_COMPLETE '+filename,flush=True)
