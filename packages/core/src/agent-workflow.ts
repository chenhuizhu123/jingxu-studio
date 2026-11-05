import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

const toolCall = z.object({
  id: z.string().min(1).max(200),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1).max(100),
    arguments: z.string().max(100_000),
  }),
});
const modelMessage = z.object({
  role: z.literal("assistant"),
  content: z.string().max(100_000).nullable().optional(),
  tool_calls: z.array(toolCall).max(64).optional(),
});
export type AgentMessage = Record<string, unknown>;
export type AgentProgress = {
  phase: "model" | "tool" | "tool-result";
  turn: number;
  toolCount: number;
  tool?: string;
  outcome?: "ok" | "error" | "skipped";
};
type Dependencies = {
  model: (messages: AgentMessage[]) => Promise<unknown>;
  execute: (name: string, args: unknown) => Promise<unknown>;
  errorText: (error: unknown) => string;
  progress?: (event: AgentProgress) => void;
  limitText: string;
  emptyText: string;
};
const State = Annotation.Root({
  messages: Annotation<AgentMessage[]>,
  turn: Annotation<number>,
  toolCount: Annotation<number>,
  output: Annotation<string>,
});

// LangGraph owns routing and state transitions. Project mutations remain in the
// application's validated tools; external MCP execution still requires approval.
// Runs are deliberately not replayed automatically: a killed external request
// may have succeeded even when its response was never received.
export function createDirectorWorkflow(deps: Dependencies) {
  const results = new Map<string, { signature: string; content: string }>();
  return new StateGraph(State)
    .addNode("model", async (state) => {
      const turn = state.turn + 1;
      deps.progress?.({ phase: "model", turn, toolCount: state.toolCount });
      const message = modelMessage.parse(await deps.model(state.messages));
      const ids = message.tool_calls?.map((call) => call.id) ?? [];
      if (new Set(ids).size !== ids.length)
        throw new Error(
          "Model returned duplicate tool call IDs in one response",
        );
      return {
        turn,
        messages: [...state.messages, message],
        output: message.tool_calls?.length
          ? ""
          : message.content?.trim() || deps.emptyText,
      };
    })
    .addNode("tools", async (state) => {
      const message = modelMessage.parse(state.messages.at(-1));
      const messages = [...state.messages];
      let toolCount = state.toolCount;
      for (const [index, call] of (message.tool_calls ?? []).entries()) {
        const signature = JSON.stringify(call.function);
        const previous = results.get(call.id);
        let result: unknown;
        let outcome: AgentProgress["outcome"] = "ok";
        let content: string;
        if (previous) {
          // Repeated IDs from a model retry must not apply an edit twice.
          content =
            previous.signature === signature
              ? previous.content
              : JSON.stringify({
                  error: "Tool call ID was reused with different arguments",
                });
          outcome = "skipped";
        } else {
          if (index >= 10 || toolCount >= 40) {
            result = {
              error: "Tool budget reached; this call was not executed",
            };
            outcome = "skipped";
          } else {
            toolCount++;
            deps.progress?.({
              phase: "tool",
              turn: state.turn,
              toolCount,
              tool: call.function.name,
            });
            try {
              const args = JSON.parse(call.function.arguments || "{}");
              result = await deps.execute(call.function.name, args);
            } catch (error) {
              result = { error: deps.errorText(error) };
              outcome = "error";
            }
          }
          const json = JSON.stringify(result ?? null);
          content =
            json.length <= 50_000
              ? json
              : JSON.stringify({
                  truncated: true,
              preview: json.slice(0, 20_000),
                });
          results.set(call.id, { signature, content });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content });
        deps.progress?.({
          phase: "tool-result",
          turn: state.turn,
          toolCount,
          tool: call.function.name,
          outcome,
        });
      }
      return {
        messages,
        toolCount,
        output: state.turn >= 8 || toolCount >= 40 ? deps.limitText : "",
      };
    })
    .addEdge(START, "model")
    .addConditionalEdges("model", (state) => (state.output ? END : "tools"))
    .addConditionalEdges("tools", (state) => (state.output ? END : "model"))
    .compile();
}

export async function runDirectorWorkflow(
  messages: AgentMessage[],
  deps: Dependencies,
) {
  const graph = createDirectorWorkflow(deps);
  return graph.invoke(
    { messages, turn: 0, toolCount: 0, output: "" },
    {
      recursionLimit: 20,
      // No tracing service or hosted LangGraph server is required.
      callbacks: [],
    },
  );
}
