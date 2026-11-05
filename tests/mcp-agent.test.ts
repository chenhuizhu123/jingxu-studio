import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { Store } from "../packages/core/src/store";
import { McpHub } from "../packages/core/src/mcp";
import { DirectorAgent } from "../packages/core/src/agent";
import {
  createProject,
  buildStoryboard,
  defaultSettings,
} from "../packages/core/src/model";
let store: Store | undefined, server: Server | undefined;
afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
  if (store) {
    const root = store.root;
    store.close();
    await rm(root, { recursive: true, force: true });
    store = undefined;
  }
});
async function setup() {
  store = await Store.open(await mkdtemp(join(tmpdir(), "jingxu-agent-")));
  const p = createProject({ name: "助手测试", script: "林晚：你好。" });
  buildStoryboard(p);
  store.put("project", p.id, p);
  const s = structuredClone(defaultSettings);
  s.mcp = [
    {
      id: "test",
      name: "本地测试工具",
      transport: "stdio",
      command: process.execPath,
      args: [resolve("tests/fixtures/mcp-server.mjs")],
      enabled: true,
    },
  ];
  store.saveSettings(s);
  return p;
}
describe("MCP 和助手真实协议集成", () => {
  it("通过 STDIO 完成工具发现、审批、执行与持久记录", async () => {
    const p = await setup(),
      hub = new McpHub(store!);
    expect((await hub.tools("test"))[0].name).toBe("echo");
    const a = hub.request(p.id, "test", "echo", { text: "hello" });
    expect(a.state).toBe("pending");
    expect(store!.project(p.id).messages).toHaveLength(0);
    const result = await hub.decide(a.id, true);
    expect(result.state).toBe("approved");
    expect(result.result).toContain("echo:hello");
    expect(store!.project(p.id).messages[0].role).toBe("tool");
    await expect(hub.decide(a.id, true)).rejects.toThrow("已经处理");
  });
  it("拒绝请求不会执行，未知服务不能调用", async () => {
    const p = await setup(),
      hub = new McpHub(store!);
    const a = hub.request(p.id, "test", "echo", { text: "no" });
    expect((await hub.decide(a.id, false)).state).toBe("rejected");
    expect(store!.project(p.id).messages).toHaveLength(0);
    await expect(hub.tools("unknown")).rejects.toThrow("未启用");
  });
  it("模型工具循环根据实际工具结果修改项目", async () => {
    const p = await setup();
    let turns = 0;
    server = createServer(async (req, res) => {
      let text = "";
      for await (const c of req) text += c;
      const body = JSON.parse(text);
      turns++;
      res.setHeader("content-type", "application/json");
      if (turns === 1)
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call-1",
                      type: "function",
                      function: {
                        name: "shot_update",
                        arguments: JSON.stringify({
                          shotId: p.shots[0].id,
                          patch: { note: "保留场景，只修改服装颜色" },
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        );
      else {
        expect(body.messages.some((m: any) => m.role === "tool")).toBe(true);
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "已保存局部返修要求，当前选用版本未改变。",
                },
              },
            ],
          }),
        );
      }
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as any).port,
      s = store!.settings();
    s.agent = {
      endpoint: `http://127.0.0.1:${port}`,
      model: "tool-capable-test",
      apiKey: "test-key",
    };
    store!.saveSettings(s);
    const agent = new DirectorAgent(
      store!,
      resolve("packages/core/skills"),
      new McpHub(store!),
    );
    expect(
      await agent.chat(p.id, "修改第一个镜头的返修要求", "shot-repair"),
    ).toContain("已保存");
    expect(store!.project(p.id).shots[0].note).toBe("保留场景，只修改服装颜色");
    expect(store!.project(p.id).messages).toHaveLength(2);
    expect(turns).toBe(2);
    expect(agent.runs(p.id)[0]).toMatchObject({
      status: "completed",
      projectId: p.id,
    });
    expect(
      agent.runs(p.id)[0].events.some((e) => e.tool === "shot_update"),
    ).toBe(true);
  });
  it("使用真实 MCP SDK 发现工具并保存待确认请求，不执行外部写操作", async () => {
    const p = await setup();
    let turns = 0;
    const calls = [
      ["project_read", {}],
      ["quality_check", {}],
      ["mcp_tools", { serverId: "test" }],
      [
        "mcp_request",
        { serverId: "test", tool: "echo", arguments: { text: "pending" } },
      ],
      [
        "storyboard_set",
        {
          shots: [
            {
              title: "Opening",
              scene: "Office",
              type: "Wide",
              duration: 3,
              dialogue: "Hello",
              prompt: "Office",
              characterIds: [p.characters[0].id],
            },
          ],
        },
      ],
    ] as const;
    server = createServer(async (req, res) => {
      for await (const _ of req) {
        /* drain request */
      }
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              message:
                ++turns === 1
                  ? {
                      role: "assistant",
                      content: null,
                      tool_calls: calls.map(([name, args], i) => ({
                        id: `tool-${i}`,
                        type: "function",
                        function: { name, arguments: JSON.stringify(args) },
                      })),
                    }
                  : {
                      role: "assistant",
                      content: "The request is awaiting approval.",
                    },
            },
          ],
        }),
      );
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const s = store!.settings();
    s.agent = {
      endpoint: `http://127.0.0.1:${(server.address() as any).port}`,
      model: "test",
      apiKey: "secret-model-key",
    };
    store!.saveSettings(s);
    const agent = new DirectorAgent(
      store!,
      resolve("packages/core/skills"),
      new McpHub(store!),
    );
    await agent.chat(
      p.id,
      "Check project and propose a tool action",
      undefined,
      "en",
    );
    expect(store!.project(p.id).shots[0].title).toBe("Opening");
    expect(store!.approvals()).toHaveLength(1);
    expect(store!.approvals()[0].state).toBe("pending");
    expect(store!.project(p.id).messages.some((m) => m.role === "tool")).toBe(
      false,
    );
    expect(
      agent.runs(p.id)[0].events.filter((e) => e.phase === "tool-result"),
    ).toHaveLength(5);
    expect(JSON.stringify(agent.runs(p.id))).not.toContain("secret-model-key");
  });
  it("模型失败会记录已中断的阶段，重启后不自动重放运行", async () => {
    const p = await setup();
    server = createServer(async (req, res) => {
      let body = "";
      for await (const c of req) body += c;
      expect(JSON.parse(body).messages[0].content).toContain(
        "Respond in English",
      );
      res.writeHead(502, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: { message: "upstream failure secret-model-key" },
        }),
      );
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const s = store!.settings();
    s.agent = {
      endpoint: `http://127.0.0.1:${(server.address() as any).port}`,
      model: "test",
      apiKey: "secret-model-key",
    };
    store!.saveSettings(s);
    const agent = new DirectorAgent(
      store!,
      resolve("packages/core/skills"),
      new McpHub(store!),
    );
    await expect(
      agent.chat(p.id, "Repair this", undefined, "en"),
    ).rejects.toThrow();
    expect(agent.runs(p.id)[0].status).toBe("failed");
    expect(JSON.stringify(agent.runs(p.id))).not.toContain("secret-model-key");
    const run = agent.runs(p.id)[0];
    store!.put("agent-run", "unfinished", {
      ...run,
      id: "unfinished",
      status: "running",
    });
    new DirectorAgent(
      store!,
      resolve("packages/core/skills"),
      new McpHub(store!),
    );
    expect(agent.runs(p.id).find((r) => r.id === "unfinished")?.status).toBe(
      "interrupted",
    );
    expect(store!.project(p.id).messages).toHaveLength(1);
  });
});
