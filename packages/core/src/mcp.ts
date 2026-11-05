import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Store } from "./store";
import { AppError, id, now, type Approval } from "./model";
import { endpoint } from "./providers";

export class McpHub {
  constructor(private store: Store) {}
  async withClient<T>(serverId: string, fn: (client: Client) => Promise<T>) {
    const config = this.store
      .settings()
      .mcp.find((c) => c.id === serverId && c.enabled);
    if (!config) throw new AppError(404, "MCP 服务未启用");
    const client = new Client({ name: "jingxu-studio", version: "0.1.0" });
    let transport;
    if (config.transport === "stdio") {
      if (!config.command) throw new AppError(400, "MCP 命令不能为空");
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          ...(process.env.SystemRoot
            ? { SystemRoot: process.env.SystemRoot }
            : {}),
        },
        stderr: "pipe",
      });
    } else {
      if (!config.url) throw new AppError(400, "缺少 MCP 地址");
      transport = new StreamableHTTPClientTransport(
        new URL(endpoint(config.url)),
      );
    }
    try {
      await client.connect(transport, { timeout: 15000 });
      return await fn(client);
    } finally {
      await client.close().catch(() => {});
      await transport.close().catch(() => {});
    }
  }
  async tools(serverId: string) {
    return this.withClient(serverId, async (client) => {
      const r = await client.listTools(undefined, { timeout: 15000 });
      return r.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    });
  }
  request(
    projectId: string,
    serverId: string,
    tool: string,
    args: Record<string, unknown>,
  ) {
    this.store.project(projectId);
    if (!this.store.settings().mcp.some((c) => c.id === serverId && c.enabled))
      throw new AppError(404, "MCP 服务未启用");
    const a: Approval = {
      id: id(),
      projectId,
      serverId,
      tool,
      arguments: args,
      state: "pending",
      createdAt: now(),
    };
    this.store.put("approval", a.id, a);
    return a;
  }
  async decide(approvalId: string, approve: boolean) {
    const a = this.store.get<Approval>("approval", approvalId);
    if (!a) throw new AppError(404, "执行请求不存在");
    if (a.state !== "pending") throw new AppError(409, "执行请求已经处理");
    a.state = approve ? "approved" : "rejected";
    this.store.put("approval", a.id, a);
    if (!approve) return a;
    try {
      const result = await this.withClient(a.serverId, (c) =>
        c.callTool({ name: a.tool, arguments: a.arguments }, undefined, {
          timeout: 60000,
        }),
      );
      a.result = JSON.stringify(result).slice(0, 30000);
      a.state = result.isError ? "failed" : "approved";
    } catch (error) {
      a.state = "failed";
      a.result = error instanceof Error ? error.message : "MCP 执行失败";
    }
    this.store.put("approval", a.id, a);
    this.store.mutate(a.projectId, (p) =>
      p.messages.push({
        id: id(),
        role: "tool",
        text: `MCP ${a.tool}：${a.result ?? a.state}`,
        createdAt: now(),
      }),
    );
    return a;
  }
}
