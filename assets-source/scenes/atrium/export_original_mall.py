"""Export the requested untouched checkpoint, batching static meshes for the browser.

Run Blender --background --factory-startup --python-exit-code 1 --python this_file.
All conversion and joins occur in memory; the source .blend is never saved.
"""
import bpy, hashlib, json, math
from collections import defaultdict
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent / 'backups/luminary-galleria-before-floorplans.blend'
OUT = ROOT / 'public/mall-assets'
OUT.mkdir(parents=True, exist_ok=True)
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
assert scene['retail_floor_count'] == 4 and scene['parking_vehicles'] == 18

def web(v):
    return [v.x, v.z, -v.y]

camera_names = {
    'exterior': 'LUM | Twilight exterior',
    'atrium': 'Interior promenade',
    'parking': 'P1 | Cinematic aisle',
    'pickup': 'P1 | Pickup craftsmanship',
    'suv': 'P1 | SUV portrait',
    'arrival': 'LUM | Promenade arrival',
}
views = {}
for key, name in camera_names.items():
    o = bpy.data.objects[name]
    direction = o.matrix_world.to_quaternion() @ Vector((0, 0, -1))
    views[key] = {'position': web(o.matrix_world.translation),
                  'target': web(o.matrix_world.translation + direction * (65 if key == 'exterior' else 15)),
                  'fov': math.degrees(2 * math.atan(o.data.sensor_width / (2 * o.data.lens))) * .8}

lights = []
for o in scene.objects:
    if o.type == 'LIGHT':
        d = o.data
        lights.append({'name': o.name, 'type': d.type, 'position': web(o.matrix_world.translation),
                       'target': web(o.matrix_world.translation + o.matrix_world.to_quaternion() @ Vector((0,0,-1))),
                       'color': list(d.color), 'power': d.energy,
                       'size': getattr(d, 'size', 1)})

geometry = [o for o in scene.objects if o.type in {'MESH', 'CURVE', 'FONT', 'SURFACE'}]
source_objects = len(geometry)
buckets = defaultdict(list)
for o in geometry:
    names = [c.name for c in o.users_collection]
    category = 'garage' if any(n.startswith('P1 |') for n in names) else 'exterior' if any(n.startswith('LUM |') for n in names) else 'interior'
    # Keep different heights and spatial regions separate for culling and sorting.
    pos = o.matrix_world.translation
    cell = (math.floor(pos.x / 32), math.floor(pos.y / 32), math.floor(pos.z / 4.4))
    buckets[(category, cell)].append(o)

bpy.ops.object.select_all(action='DESELECT')
for o in geometry:
    o.hide_set(False)
    o.hide_viewport = False
    o.select_set(True)
bpy.context.view_layer.objects.active = geometry[0]
# Bake bevels, text outlines, smooth and weighted normals before joining.
bpy.ops.object.convert(target='MESH')
converted = {o.name: o for o in bpy.context.selected_objects}
roots = {}
for category in ['exterior', 'interior', 'garage']:
    root = bpy.data.objects.new('Mall_' + category, None)
    scene.collection.objects.link(root)
    roots[category] = root
batched = []
for (category, cell), objects in buckets.items():
    objects = [converted[o.name] for o in objects]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = f'{category}_{cell[0]}_{cell[1]}_{cell[2]}'
    matrix = o.matrix_world.copy()
    o.parent = roots[category]
    o.matrix_world = matrix
    batched.append(o)
    if len(batched) % 20 == 0:
        print(f'MALL_BATCHED {len(batched)}/{len(buckets)}', flush=True)

bpy.ops.object.select_all(action='DESELECT')
for o in [*batched, *roots.values()]:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'luminary-original.glb'), export_format='GLB',
    use_selection=True, export_apply=True, export_cameras=False, export_lights=False,
    export_animations=False, export_extras=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=18, export_draco_normal_quantization=12,
    export_draco_texcoord_quantization=16)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
report = {'source': str(SOURCE.relative_to(ROOT)), 'sourceSha256': source_hash,
    'retailFloors': 4, 'garageVehicles': 18, 'valetVehicles': 2, 'parkingBays': 31,
    'sourceGeometryObjects': source_objects, 'batchedMeshes': len(batched),
    'bytes': (OUT / 'luminary-original.glb').stat().st_size, 'views': views, 'lights': lights}
(OUT / 'luminary-original.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('ORIGINAL_MALL_EXPORTED ' + json.dumps({k:v for k,v in report.items() if k not in {'views','lights'}}), flush=True)
