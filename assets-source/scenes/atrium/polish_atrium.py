import bpy
s=bpy.context.scene
m=bpy.data.materials.get('Clear architectural glazing') or bpy.data.materials.new('Clear architectural glazing')
m.use_nodes=True;m.diffuse_color=(.52,.7,.72,.18)
p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
p.inputs['Base Color'].default_value=(.52,.7,.72,1);p.inputs['Alpha'].default_value=.18;p.inputs['Roughness'].default_value=.12;p.inputs['Metallic'].default_value=.1;p.inputs['Transmission Weight'].default_value=0
if hasattr(m,'surface_render_method'):
 choices=[i.identifier for i in m.bl_rna.properties['surface_render_method'].enum_items]
 if 'DITHERED' in choices:m.surface_render_method='DITHERED'
for o in bpy.data.objects:
 if o.type=='MESH' and any(t in o.name for t in ['glass balustrade','Rear atrium glass','front glazing','Shopfront fixed glass']):
  o.data.materials.clear();o.data.materials.append(m)
for o in bpy.data.objects:
 if o.type=='LIGHT':
  if o.data.type=='POINT':o.data.use_shadow=False
  if 'retail ambient' in o.name:o.data.energy=270
  if 'Promenade warm pool' in o.name:o.data.energy=320
  if o.name=='Late afternoon sun':o.data.energy=1.25;o.data.color=(1,.65,.35)
  if o.name=='Cool sky fill':o.data.energy=2800
  if o.name=='Basement illumination' or o.name.startswith('Basement illumination.'):o.data.energy=350
w=bpy.data.materials.get('2700K integrated lighting')
p=next(n for n in w.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Emission Strength'].default_value=6
s.camera=bpy.data.objects['Architectural hero camera']
s.render.resolution_x=1440;s.render.resolution_y=1152
result={'clear_glazing':True,'point_fill_shadows':False,'retail_floors':s.get('retail_floor_count'),'cars':s.get('parking_vehicle_count')}

