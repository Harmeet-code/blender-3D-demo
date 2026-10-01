"""Read-only end-to-end check through the registered MCP stdio server."""
import asyncio
import json
import os
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    env = dict(os.environ, PYTHONUTF8="1", BLENDER_MCP_SAFE_MODE="1")
    params = StdioServerParameters(command=sys.argv[1], args=["--python", "3.11", "mcp-for-blender"], env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            listing = await session.list_tools()
            names = [tool.name for tool in listing.tools]
            scene_tool = next(name for name in names if "scene_info" in name)
            info = await session.call_tool(scene_tool, {"user_prompt": "Inspect the fresh Blender scene without modifying it to confirm the local MCP connection."})
            evidence = {"tool": scene_tool, "tools": names, "result": info.model_dump(mode="json")}
            (Path(__file__).resolve().parents[2] / "reports/assets/mcp-connection.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
            print("MCP scene tool:", scene_tool, "error:", info.is_error)
            if info.is_error:
                raise RuntimeError("MCP scene-info request failed")
asyncio.run(main())
