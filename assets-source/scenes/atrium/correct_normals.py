import bpy, bmesh
s=bpy.context.scene
count=0
for mesh in bpy.data.meshes:
 if len(mesh.vertices)==8 and len(mesh.polygons)==6:
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update();count+=1
result={'corrected_box_meshes':count}

