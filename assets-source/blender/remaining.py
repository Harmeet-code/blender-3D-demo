"""Original production recipes for the eight optional venue assets.

All tuples below are exported X/Y/Z meters. Source orientation conversion is
owned by build.py so neither roots nor variants need corrective transforms.
"""
import math
import bpy
from mathutils import Vector

QUALITY_VARIANTS = {
    "display-case": ["opaque"], "forklift": ["low"],
    "elevator-entrance": ["low"], "stairs": ["low"],
    "escalator-entrance": ["low"],
}


def build_remaining(asset_id, quality, root, box, cylinder, socket, material, xyz):
    low = quality == "low"
    sockets = {}
    anchor = "floor-contact"

    def part(name, size, position, finish="frame", bevel=0):
        return box(root, name, size, position, finish, 0 if low else bevel)

    def mesh(name, points, faces, finish):
        data = bpy.data.meshes.new(name)
        data.from_pydata([xyz(point) for point in points], [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.parent = root
        data.materials.append(material(finish))
        return obj

    def beam(name, start, end, finish="metal", width=.06):
        direction = Vector(xyz(end)) - Vector(xyz(start))
        center = tuple((a + b) / 2 for a, b in zip(start, end))
        obj = part(name, (width, width, direction.length), center, finish)
        obj.rotation_euler = direction.to_track_quat("Y", "Z").to_euler()
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        return obj

    def ramp(name, width, start, end, rise, finish):
        # Triangular prism: no degenerate lower-end quads or hidden collider mesh.
        points = [(x, y, z) for x in [-width / 2, width / 2]
                  for y, z in [(0, start), (0, end), (rise, end)]]
        return mesh(name, points, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], finish)

    def escalator_belt(name, x):
        curve = bpy.data.curves.new(name, "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = .035
        curve.bevel_resolution = 0 if low else 1
        points = [(x, 1.02, .15), (x, 1.02, -.5), (x, 5.02, -6.5), (x, 5.02, -7.15)]
        segments = 8 if low else 16
        for i in range(1, segments + 1):
            angle = math.pi * i / segments
            points.append((x, 4.705 + .315 * math.cos(angle), -7.15 - .315 * math.sin(angle)))
        points += [(x, 4.39, -6.5), (x, .39, -.5), (x, .39, .15)]
        for i in range(1, segments):
            angle = math.pi * i / segments
            points.append((x, .705 - .315 * math.cos(angle), .15 + .315 * math.sin(angle)))
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for vertex, point in zip(spline.points, points):
            vertex.co = (*xyz(point), 1)
        spline.use_cyclic_u = True
        obj = bpy.data.objects.new(name, curve)
        bpy.context.collection.objects.link(obj)
        obj.parent = root
        curve.materials.append(material("frame"))
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")

    if asset_id == "display-case":
        part("mesh_cabinet", (1.2, .62, .5), (0, .31, 0), "frame", .006)
        part("mesh_shelf", (1.16, .025, .46), (0, .635, 0))
        for x in [-.585, .585]:
            for z in [-.235, .235]:
                part(f"mesh_post_{x}_{z}", (.025, .46, .025), (x, .85, z))
        glass = "glass_opaque" if quality == "opaque" else "glass"
        for z in [-.244, .244]:
            part(f"mesh_glass_{z}", (1.15, .425, .008), (0, .8645, z), glass)
        for x in [-.575, .575]:
            part(f"mesh_glass_side_{x}", (.008, .425, .46), (x, .8645, 0), glass)
        part("mesh_glass_top", (1.16, .008, .48), (0, 1.096, 0), glass)
        for z in [-.235, .235]:
            part(f"mesh_top_frame_{z}", (1.2, .018, .025), (0, 1.091, z))
        part("mesh_handle", (.18, .018, .012), (.35, .4, .244))
        sockets = {"socket_interaction": [0, 0, .85]}

    elif asset_id == "safe":
        part("mesh_body", (.6, .8, .57), (0, .4, -.015), "metal", .012)
        part("mesh_door", (.51, .69, .025), (0, .4, .2775), "metal", .005)
        cylinder(root, "mesh_lock", .035, .008, (-.1, .49, .291), "metal", "Z", 12)
        part("mesh_handle", (.14, .027, .01), (.105, .41, .295), "metal", .003)
        for y in [.19, .61]:
            part(f"mesh_hinge_{y}", (.025, .07, .01), (-.265, y, .295), "metal", .002)
        sockets = {"socket_interaction": [0, 0, .9]}

    elif asset_id == "pallet":
        for i in range(5):
            part(f"mesh_board_{i}", (1.2, .035, .13), (0, .1325, -.335 + i * .1675), "wood")
        for x in [-.48, 0, .48]:
            part(f"mesh_runner_{x}", (.14, .035, .8), (x, .0175, 0), "wood")
            for z in [-.28, 0, .28]:
                part(f"mesh_block_{x}_{z}", (.14, .08, .14), (x, .075, z), "wood")

    elif asset_id == "banner-stand":
        part("mesh_base", (1, .045, .3), (0, .0225, 0))
        part("mesh_banner_back", (.95, 1.8, .02), (0, 1.1, 0), "branding")
        for x in [-.46, .46]:
            part(f"mesh_post_{x}", (.03, 1.9, .03), (x, .95, -.025))
        surface = mesh("branding_surface", [(-.475, .2, .013), (.475, .2, .013), (.475, 2, .013), (-.475, 2, .013)], [(0, 1, 2, 3)], "branding")
        uv = surface.data.uv_layers.new(name="branding_uv")
        for loop, value in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop.uv = value
        # A replaceable, texture-free default brand mark; no text or logo bake dependency.
        for i, width in enumerate([.4, .28, .16]):
            part(f"branding_default_{i}", (width, .045, .005), (0, 1.38 - i * .12, .018))
        sockets = {"socket_branding": [0, 1.1, .013]}

    elif asset_id == "forklift":
        part("mesh_chassis", (1.05, .55, 1.6), (0, .6, -.425), "yellow", .03)
        part("mesh_counterweight", (1.05, .45, .4), (0, .95, -1.025), "yellow", .025)
        part("mesh_seat", (.42, .14, .4), (0, 1.05, -.4))
        if not low:
            part("mesh_seat_back", (.42, .38, .08), (0, 1.23, -.58), bevel=.015)
            part("mesh_footrest", (.7, .035, .45), (0, .91, -.02), "yellow")
            cylinder(root, "mesh_steering", .13, .025, (0, 1.35, -.05), "frame", "Y", 16)
            beam("mesh_steering_column", (0, 1.08, .02), (0, 1.35, -.05), width=.03)
        for x in [-.53, .53]:
            for z in [-.9, .1]:
                wheel = cylinder(root, f"mesh_wheel_{x}_{z}", .3, .14, (x, .3, z), "frame", "X", 8 if low else 24)
                for polygon in wheel.data.polygons:
                    polygon.use_smooth = len(polygon.vertices) == 4
                if not low:
                    cylinder(root, f"mesh_hub_{x}_{z}", .15, .008, (x + math.copysign(.066, x), .3, z), "metal", "X", 12)
        for x in [-.43, .43]:
            part(f"mesh_mast_{x}", (.07, 1.9, .08), (x, 1.2, .48), "metal", .006)
            for z in [-.9, .2]:
                part(f"mesh_cab_post_{x}_{z}", (.045, 1.25, .045), (x, 1.55, z), "metal")
        part("mesh_carriage", (.92, .18, .09), (0, .3, .5), "metal")
        part("mesh_roof", (1.1, .06, 1.35), (0, 2.17, -.35), "yellow", .01)
        for x in [-.33, .33]:
            part(f"mesh_fork_{x}", (.12, .07, 1.55), (x, .14, 1), "metal")
            if not low:
                part(f"mesh_fork_upright_{x}", (.12, .32, .07), (x, .265, .26), "metal")
        if not low:
            for x in [-.48, .48]:
                part(f"mesh_fender_{x}", (.16, .04, .68), (x, .66, .1), "yellow", .008)
                part(f"mesh_work_light_{x}", (.1, .08, .05), (x, 2.04, .3), "metal")
        sockets = {"socket_service": [0, 0, 0]}

    elif asset_id == "elevator-entrance":
        anchor = "portal-entry"
        for x in [-.9, .9]:
            part(f"mesh_frame_{x}", (.2, 2.6, .3), (x, 1.3, 0), "metal", .006)
        part("mesh_lintel", (1.6, .2, .3), (0, 2.5, 0), "metal", .006)
        part("mesh_threshold", (1.6, .05, .3), (0, -.025, 0), "metal")
        for name, x in [("door_left", -.4), ("door_right", .4)]:
            door = part(name, (.79, 2.4, .08), (x, 1.2, -.06), "panel", .003)
            if not low:
                for y in [.4, .8, 1.6, 2.0]:
                    trim = part(f"{name}_trim_{y}", (.75, .012, .007), (x, y, -.016), "metal")
                    bpy.context.view_layer.update()
                    trim.parent = door
                    trim.matrix_parent_inverse = door.matrix_world.inverted()
        part("mesh_button", (.08, .16, .02), (.9, 1.1, .14), "branding")
        if not low:
            part("mesh_indicator", (.18, .045, .012), (0, 2.5, .143), "branding")
        sockets = {"portal_lower": [0, 0, .2]}

    elif asset_id in ["stairs", "escalator-entrance"]:
        anchor = "portal-entry"
        escalator = asset_id == "escalator-entrance"
        # The flight is 6 m; 1 m approach/exit landings make the complete footprint 8 m.
        part("mesh_lower_landing", (2, .1, 1), (0, -.05, 0), "metal" if escalator else "frame")
        part("mesh_upper_landing", (2, .1, 1), (0, 3.95, -7), "metal" if escalator else "frame")
        if low:
            ramp("mesh_flight_low", 2, -.5, -6.5, 4, "frame")
        else:
            count = 20 if not escalator else 24
            for i in range(count):
                rise = 4 * (i + 1) / count
                depth = 6 / count
                z = -.5 - depth * (i + .5)
                part(f"mesh_step_{i:02}", (2, rise, depth), (0, rise / 2, z))
                if escalator:
                    part(f"mesh_safety_nosing_{i:02}", (1.75, .012, .028), (0, rise + .006, z + depth / 2 - .015), "yellow")
        for x in [-.93, .93]:
            if escalator:
                escalator_belt(f"mesh_handrail_belt_{x}", x)
                # Opaque balustrades use the same steel finish; no fourth glass material.
                profile = [(.06, -.5), (4.06, -6.5), (4.92, -6.5), (.92, -.5)]
                points = [(side, y, z) for side in [x - .035, x + .035] for y, z in profile]
                mesh(f"mesh_balustrade_{x}", points, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], "metal")
                for z, y in [(.25, 0), (-7.25, 4)]:
                    part(f"mesh_end_casing_{x}_{z}", (.12, .9, .45), (x, y + .45, z), "metal")
            else:
                beam(f"mesh_rail_{x}", (x, 1.02, -.5), (x, 5.02, -6.5), "metal", .07)
                beam(f"mesh_rail_entry_{x}", (x, 1.02, .45), (x, 1.02, -.5), "metal", .07)
                beam(f"mesh_rail_exit_{x}", (x, 5.02, -6.5), (x, 5.02, -7.45), "metal", .07)
            positions = [] if escalator else [0, 1] if low else [i / 5 for i in range(6)]
            for index, t in enumerate(positions):
                beam(f"mesh_post_{x}_{index}", (x, 4 * t, -.5 - 6 * t), (x, 4 * t + 1.02, -.5 - 6 * t), "metal", .05)
        if escalator:
            for z, y in [(0, 0), (-7, 4)]:
                part(f"mesh_comb_plate_{z}", (1.75, .012, .07), (0, y + .006, z), "yellow")
        sockets = {"portal_lower": [0, 0, 0], "portal_upper": [0, 4, -7]}

    else:
        raise ValueError(f"Unknown recipe: {asset_id}")

    for name, position in sockets.items():
        socket(root, name, position)
    root["asset_id"] = asset_id
    root["asset_version"] = 1
    root["generator_version"] = "1.1.0"
    root["quality_variant"] = quality
    return root, anchor, sockets


def interface_details(asset_id):
    details = {}
    if asset_id == "banner-stand":
        details["requiredNodes"] = ["branding_surface"] + [f"branding_default_{i}" for i in range(3)]
        details["branding"] = {"node": "branding_surface", "socket": "socket_branding", "width": .95, "height": 1.8, "normal": [0, 0, 1], "defaultNodes": [f"branding_default_{i}" for i in range(3)]}
    if asset_id in ["stairs", "escalator-entrance"]:
        details["portalRise"] = 4
        details["colliders"] = [
            {"halfExtents": [1, .05, .5], "position": [0, -.05, 0], "rotation": [0, 0, 0]},
            {"halfExtents": [1, .05, .5], "position": [0, 3.95, -7], "rotation": [0, 0, 0]},
            {"halfExtents": [.9, .05, math.hypot(6, 4) / 2], "position": [0, 1.98, -3.5], "rotation": [math.atan2(4, 6), 0, 0]},
        ]
    return details
