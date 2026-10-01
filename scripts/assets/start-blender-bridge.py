"""Launch with a fresh GUI Blender process; background Blender cannot drain MCP commands."""
import json
import sys
from pathlib import Path
import bpy
import addon_utils

addon_dir = Path(bpy.utils.user_resource("SCRIPTS")) / "addons"
sys.path.insert(0, str(addon_dir))
addon_utils.enable("blender_mcp", default_set=True, persistent=True)
import blender_mcp

def start():
    bpy.context.scene.blendermcp_port = 9876
    bpy.context.scene.blendermcp_auto_start_server = True
    if not getattr(bpy.types, "blendermcp_server", None):
        bpy.types.blendermcp_server = blender_mcp.BlenderMCPServer(port=9876)
    bpy.types.blendermcp_server.start()
    bpy.ops.wm.save_userpref()
    evidence = {"blender": bpy.app.version_string, "port": 9876, "scene": bpy.context.scene.name, "background": bpy.app.background}
    (Path(__file__).resolve().parents[2] / "reports/assets/blender-bridge.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    return None
bpy.app.timers.register(start, first_interval=2)
