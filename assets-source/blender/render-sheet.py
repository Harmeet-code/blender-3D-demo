"""Render a labeled sheet of native Blender previews without changing the assets."""
from pathlib import Path
import bpy

project = Path(__file__).resolve().parents[2]
assets = ["display-case", "safe", "pallet", "banner-stand", "forklift", "elevator-entrance", "stairs", "escalator-entrance"]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.world = bpy.data.worlds.new("preview_background")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.008, .014, .021, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1

def emission_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    output = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    return mat

caption = emission_material("caption", (.78, .86, .9, 1))

def label(text, x, y, size):
    bpy.ops.object.text_add(location=(x, y, .01))
    obj = bpy.context.object
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.size = size
    obj.data.materials.append(caption)

label("VENUE ASSET KIT / REMAINING EIGHT", 0, 4.85, .42)
label("Blender sources + GLB exports / meters / 4 m portal rise", 0, 4.45, .22)
for index, asset in enumerate(assets):
    x = (index % 4 - 1.5) * 4.8
    y = 2.1 if index < 4 else -2.55
    bpy.ops.mesh.primitive_plane_add(size=4.3, location=(x, y, 0))
    plane = bpy.context.object
    plane.name = asset + "_preview_card"
    mat = bpy.data.materials.new(asset + "_preview")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    image = nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(str(project / "src/frontend/assets/images/asset-previews" / f"{asset}.hero.png"))
    image.image.pack()
    emission = nodes.new("ShaderNodeEmission")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    output = nodes.new("ShaderNodeOutputMaterial")
    links = mat.node_tree.links
    links.new(image.outputs["Color"], emission.inputs["Color"])
    links.new(image.outputs["Alpha"], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])
    plane.data.materials.append(mat)
    label(asset.replace("-entrance", "").replace("-", " ").upper(), x, y - 2.0, .27)
bpy.ops.object.camera_add(location=(0, 0, 10))
scene.camera = bpy.context.object
scene.camera.data.type = "ORTHO"
scene.camera.data.ortho_scale = 20
bpy.ops.wm.save_as_mainfile(filepath=str(project / "assets-source/blender/asset-sheet.blend"))
scene.render.filepath = str(project / "reports/assets/remaining-assets.png")
bpy.ops.render.render(write_still=True)
