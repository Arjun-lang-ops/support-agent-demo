import { z } from "zod";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { getGraph } from "../agent/graph.js";

const MAX_STEPS = 15; // recursion limit: stops runaway agent loops
// Agent runs can include multiple model/tool steps. Keep a firm upper bound, but
// allow slow reasoning models more time than the old one-minute limit.
const configuredTimeout = Number(process.env.AGENT_TIMEOUT_MS || 180_000);
const TIMEOUT_MS = Number.isInteger(configuredTimeout) && configuredTimeout >= 30_000
  ? Math.min(configuredTimeout, 600_000)
  : 180_000;

const runConfig = (threadId) => ({
  configurable: { thread_id: threadId },
  recursionLimit: MAX_STEPS,
  signal: AbortSignal.timeout(TIMEOUT_MS),
});

const textOf = (c) =>
  typeof c === "string"
    ? c
    : Array.isArray(c)
    ? c.filter((p) => p.type === "text").map((p) => p.text).join("")
    : "";

// LangChain message -> what the React UI needs. Tool results stay server-side.
function serialize(m) {
  const type = typeof m.getType === "function" ? m.getType() : m._getType();
  if (type === "human") return { role: "user", content: textOf(m.content) };
  if (type === "ai") {
    const content = textOf(m.content);
    const toolCalls = (m.tool_calls ?? []).map((t) => ({ name: t.name, args: t.args }));
    return content || toolCalls.length ? { role: "assistant", content, toolCalls } : null;
  }
  return null;
}

async function snapshot(graph, config, extra = {}) {
  const state = await graph.getState(config);
  const interrupts = (state.tasks ?? []).flatMap((t) => t.interrupts ?? []);
  return {
    status: interrupts.length ? "pending_approval" : "idle",
    approval: interrupts[0]?.value ?? null,
    messages: (state.values?.messages ?? []).map(serialize).filter(Boolean),
    ...extra,
  };
}

// Turn runtime failures into a message the UI can show, instead of a 500.
function describeError(err) {
  if (err?.name === "GraphRecursionError")
    return "The agent hit its step limit and was stopped. Try rephrasing, or hand this to a human.";
  if (err?.name === "TimeoutError" || err?.name === "AbortError")
    return "The agent response timed out before it finished. Your request was not completed; please try again.";
  console.error(err);
  return "Something went wrong while running the agent.";
}

const chatBody = z.object({ threadId: z.string().min(8).max(64), message: z.string().trim().min(1).max(2000) });
const decideBody = z.object({
  threadId: z.string().min(8).max(64),
  approved: z.boolean(),
  note: z.string().max(300).optional(),
});

export async function sendMessage(req, res) {
  const parsed = chatBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const { threadId, message } = parsed.data;

  const graph = await getGraph();
  const config = runConfig(threadId);

  const before = await snapshot(graph, config);
  if (before.status === "pending_approval")
    return res.status(409).json({ error: "Resolve the pending approval first." });

  try {
    await graph.invoke({ messages: [new HumanMessage(message)] }, config);
    res.json(await snapshot(graph, config));
  } catch (err) {
    res.json(await snapshot(graph, runConfig(threadId), { error: describeError(err) }));
  }
}

export async function decide(req, res) {
  const parsed = decideBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  const { threadId, approved, note } = parsed.data;

  const graph = await getGraph();
  const config = runConfig(threadId);

  const before = await snapshot(graph, config);
  if (before.status !== "pending_approval")
    return res.status(409).json({ error: "Nothing is waiting for approval." });

  try {
    // Command({ resume }) is what interrupt() returns inside the approval node.
    await graph.invoke(new Command({ resume: { approved, note } }), config);
    res.json(await snapshot(graph, config));
  } catch (err) {
    res.json(await snapshot(graph, runConfig(threadId), { error: describeError(err) }));
  }
}

export async function getThread(req, res) {
  const graph = await getGraph();
  res.json(await snapshot(graph, runConfig(req.params.threadId)));
}
