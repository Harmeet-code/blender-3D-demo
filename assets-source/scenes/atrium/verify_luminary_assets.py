"""Check exported GLB structure and reusable-vehicle world-space dimensions."""
import itertools, json, math, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def read_glb(path):
    raw=path.read_bytes()
    magic,version,length=struct.unpack_from('<4sII',raw)
    assert magic==b'glTF' and version==2 and length==len(raw),path
    count,kind=struct.unpack_from('<II',raw,12)
    assert kind==0x4e4f534a,path
    doc=json.loads(raw[20:20+count])
    assert doc.get('meshes') and doc.get('nodes') and doc.get('scenes'),path
    return doc

def mat(node):
    if 'matrix' in node:
        m=node['matrix'];return [[m[c*4+r] for c in range(4)] for r in range(4)]
    x,y,z,w=node.get('rotation',[0,0,0,1]);sx,sy,sz=node.get('scale',[1,1,1]);tx,ty,tz=node.get('translation',[0,0,0])
    return [[(1-2*y*y-2*z*z)*sx,(2*x*y-2*z*w)*sy,(2*x*z+2*y*w)*sz,tx],
            [(2*x*y+2*z*w)*sx,(1-2*x*x-2*z*z)*sy,(2*y*z-2*x*w)*sz,ty],
            [(2*x*z-2*y*w)*sx,(2*y*z+2*x*w)*sy,(1-2*x*x-2*y*y)*sz,tz],[0,0,0,1]]

def mul(a,b):return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]

def bounds(doc):
    low=[float('inf')]*3;high=[float('-inf')]*3
    def visit(idx,parent):
        node=doc['nodes'][idx];world=mul(parent,mat(node))
        if 'mesh' in node:
            for prim in doc['meshes'][node['mesh']]['primitives']:
                acc=doc['accessors'][prim['attributes']['POSITION']]
                for corner in itertools.product(*zip(acc['min'],acc['max'])):
                    p=(*corner,1);v=[sum(world[r][c]*p[c] for c in range(4)) for r in range(3)]
                    for axis in range(3):low[axis]=min(low[axis],v[axis]);high[axis]=max(high[axis],v[axis])
        for child in node.get('children',[]):visit(child,world)
    identity=[[int(r==c) for c in range(4)] for r in range(4)]
    for idx in doc['scenes'][doc.get('scene',0)]['nodes']:visit(idx,identity)
    return low,high

report={}
for name in ['luminary-galleria.glb','parking-refined.glb']:
    path=ROOT/name;doc=read_glb(path)
    fleet=[n for n in doc['nodes'] if n.get('name','').startswith('P1-') and 'vehicle_class' in n.get('extras',{})]
    assert len(fleet)==18,(name,len(fleet))
    report[name]={'bytes':path.stat().st_size,'garage_vehicle_roots':len(fleet),'mesh_count':len(doc['meshes'])}
for filename in ['suv','pickup','utility-van','estate-car','sedan','electric-car']:
    path=ROOT/'vehicles'/(filename+'.glb');doc=read_glb(path);lo,hi=bounds(doc)
    dimensions=[round(hi[i]-lo[i],4) for i in range(3)]
    # glTF is Y-up. Each reusable model is delivered with floor contact at Y=0.
    assert abs(lo[1])<.01,(filename,lo)
    assert 1.3<hi[1]<2.4,(filename,hi)
    assert 4.3<dimensions[2]<5.9,(filename,dimensions)
    report['vehicles/'+filename+'.glb']={'bytes':path.stat().st_size,'dimensions_xyz_m':dimensions,'floor_y_m':round(lo[1],6),'meshes':len(doc['meshes'])}
(ROOT/'export-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
