import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const server = new McpServer({ name: "jingxu-test-tools", version: "1.0.0" });
server.registerTool(
  "echo",
  {
    description: "测试工具：返回输入，不访问外部网站。",
    inputSchema: { text: z.string() },
  },
  async ({ text }) => ({ content: [{ type: "text", text: `echo:${text}` }] }),
);
await server.connect(new StdioServerTransport());
