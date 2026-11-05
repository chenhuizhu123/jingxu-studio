import { describe, expect, it, vi } from "vitest";
import {
  runDirectorWorkflow,
  type AgentMessage,
} from "../packages/core/src/agent-workflow";

const call = (id: string, name = "project_read", args = "{}") => ({
  id,
  type: "function",
  function: { name, arguments: args },
});
const reply = (calls?: ReturnType<typeof call>[]) => ({
  role: "assistant",
  content: calls ? null : "Done",
  tool_calls: calls,
});
function deps(model: (messages: AgentMessage[]) => Promise<unknown>) {
  return {
    model: vi.fn(model),
    execute: vi.fn(async () => ({ saved: true })),
    errorText: (error: unknown) => String(error),
    progress: vi.fn(),
    limitText: "Limit reached",
    emptyText: "Complete",
  };
}
describe("LangGraph director workflow", () => {
  it("routes tool results back to the model and returns actual completion", async () => {
    const d = deps(async (messages) =>
      messages.length === 1
        ? reply([call("a", "shot_update", '{"note":"repair"}')])
        : reply(),
    );
    const result = await runDirectorWorkflow(
      [{ role: "user", content: "repair" }],
      d,
    );
    expect(d.execute).toHaveBeenCalledWith("shot_update", { note: "repair" });
    expect(result.output).toBe("Done");
    expect(result.toolCount).toBe(1);
    expect(d.model.mock.calls[1][0].at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "a",
    });
    expect(d.progress.mock.calls.map(([e]) => e.phase)).toEqual([
      "model",
      "tool",
      "tool-result",
      "model",
    ]);
  });
  it("returns argument and tool failures to the model without inventing success", async () => {
    let turn = 0;
    const d = deps(async () =>
      ++turn === 1
        ? reply([
            call("bad-json", "shot_update", "{"),
            call("failed", "shot_update"),
          ])
        : reply(),
    );
    d.execute.mockRejectedValue(new Error("Project changed"));
    const result = await runDirectorWorkflow([], d);
    expect(d.execute).toHaveBeenCalledTimes(1);
    const results = result.messages.filter((m) => m.role === "tool");
    expect(results.every((m) => JSON.parse(String(m.content)).error)).toBe(
      true,
    );
    expect(String(results[1].content)).toContain("Project changed");
  });
  it("acknowledges every tool call when the per-turn budget is exceeded", async () => {
    let turn = 0;
    const d = deps(async () =>
      ++turn === 1
        ? reply(Array.from({ length: 12 }, (_, i) => call(`call-${i}`)))
        : reply(),
    );
    const result = await runDirectorWorkflow([], d);
    expect(d.execute).toHaveBeenCalledTimes(10);
    expect(result.messages.filter((m) => m.role === "tool")).toHaveLength(12);
    expect(
      d.model.mock.calls[1][0].filter((m) => m.role === "tool"),
    ).toHaveLength(12);
    expect(
      result.messages.some((m) => String(m.content).includes("not executed")),
    ).toBe(true);
  });
  it("does not apply a repeated tool call twice or reuse its ID for a different edit", async () => {
    let turn = 0;
    const d = deps(async () =>
      ++turn < 4
        ? reply([
            call(
              "same-id",
              "shot_update",
              turn === 3 ? '{"note":"other"}' : "{}",
            ),
          ])
        : reply(),
    );
    const result = await runDirectorWorkflow([], d);
    expect(d.execute).toHaveBeenCalledTimes(1);
    expect(result.toolCount).toBe(1);
    expect(
      result.messages.filter((m) => m.role === "tool").at(-1)?.content,
    ).toContain("different arguments");
  });
  it("rejects ambiguous duplicate IDs in one response before applying edits", async () => {
    const d = deps(async () => reply([call("duplicate"), call("duplicate")]));
    await expect(runDirectorWorkflow([], d)).rejects.toThrow("duplicate");
    expect(d.execute).not.toHaveBeenCalled();
  });
  it.each([
    { role: "system", content: "impersonate system" },
    { role: "assistant", tool_calls: [{ id: "missing-function" }] },
    { role: "assistant", content: { text: "wrong protocol" } },
  ])(
    "rejects malformed provider output before tools execute: %j",
    async (message) => {
      const d = deps(async () => message);
      await expect(runDirectorWorkflow([], d)).rejects.toThrow();
      expect(d.execute).not.toHaveBeenCalled();
      expect(d.model).toHaveBeenCalledTimes(1);
    },
  );
  it("stops an endless agent at eight model requests", async () => {
    let turn = 0;
    const d = deps(async () => reply([call(String(++turn))]));
    const result = await runDirectorWorkflow([], d);
    expect(result.output).toBe("Limit reached");
    expect(d.model).toHaveBeenCalledTimes(8);
    expect(d.execute).toHaveBeenCalledTimes(8);
  });
  it("stops at forty tools across model requests", async () => {
    let turn = 0;
    const d = deps(async () => {
      turn++;
      return reply(Array.from({ length: 10 }, (_, i) => call(`${turn}-${i}`)));
    });
    const result = await runDirectorWorkflow([], d);
    expect(result.output).toBe("Limit reached");
    expect(d.model).toHaveBeenCalledTimes(4);
    expect(d.execute).toHaveBeenCalledTimes(40);
  });
  it("keeps a truncated tool response valid JSON", async () => {
    let turn = 0;
    const d = deps(async () =>
      ++turn === 1 ? reply([call("large")]) : reply(),
    );
    d.execute.mockResolvedValue({
      saved: true,
      text: '"'.repeat(90_000),
    } as any);
    const result = await runDirectorWorkflow([], d);
    const content = String(
      result.messages.find((m) => m.role === "tool")?.content,
    );
    expect(JSON.parse(content)).toMatchObject({ truncated: true });
    expect(content.length).toBeLessThan(50_000);
  });
  it("does not automatically retry a failed model request", async () => {
    const d = deps(async () => {
      throw new Error("network failure");
    });
    await expect(runDirectorWorkflow([], d)).rejects.toThrow("network failure");
    expect(d.model).toHaveBeenCalledTimes(1);
    expect(d.execute).not.toHaveBeenCalled();
  });
  it("does not share deduplication state between different user runs", async () => {
    for (let i = 0; i < 2; i++) {
      let turn = 0;
      const d = deps(async () =>
        ++turn === 1 ? reply([call("id")]) : reply(),
      );
      await runDirectorWorkflow([], d);
      expect(d.execute).toHaveBeenCalledTimes(1);
    }
  });
});
