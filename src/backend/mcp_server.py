import sys
import os
from mcp.server.fastmcp import FastMCP

# Ensure local imports work when executed from other locations
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import tools

# Initialize FastMCP Server
mcp = FastMCP("TodoMCP")

# Register the decoupled tool functions
mcp.tool()(tools.add_task)
mcp.tool()(tools.list_tasks)
mcp.tool()(tools.complete_task)
mcp.tool()(tools.delete_task)
mcp.tool()(tools.update_task)

if __name__ == "__main__":
    mcp.run()
