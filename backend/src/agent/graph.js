import mongoose from "mongoose";
import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
  Command,
  MemorySaver,
  interrupt,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { SystemMessage, ToolMessage } from "@langchain/core/messages";

import { getLLM } from "./llm.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { allTools, readTools, WRITE_TOOL_NAMES } from "./tools.js";
import { AuditLog } from "../models/index.js";

export async function buildGraph() {
  const llm = (await getLLM()).bindTools(allTools);

  // 1. The model decides: answer, or call tools (ReAct "reason + act").
  async function agentNode(state) {
    const response = await llm.invoke([new SystemMessage(SYSTEM_PROMPT), ...state.messages]);
    return { messages: [response] };
  }

  // 2. Route on the tool calls the model asked for.
  function routeAfterAgent(state) {
    const calls = state.messages.at(-1).tool_calls ?? [];
    if (calls.length === 0) return END;
    return calls.some((c) => WRITE_TOOL_NAMES.has(c.name)) ? "approval" : "readTools";
  }

  // 3. HITL gate. interrupt() pauses the graph and saves state to the checkpointer.
  //    On resume the node re-runs from the top and interrupt() returns the human's decision,
  //    so nothing with side effects may come before it.
  async function approvalNode(state, config) {
    const last = state.messages.at(-1);
    const writes = last.tool_calls.filter((c) => WRITE_TOOL_NAMES.has(c.name));

    const decision = interrupt({
      type: "approval_request",
      actions: writes.map(({ id, name, args }) => ({ id, name, args })),
    });

    const approved = Boolean(decision?.approved);
    const note = decision?.note?.trim() || "";

    await AuditLog.insertMany(
      writes.map((w) => ({
        threadId: config.configurable.thread_id,
        tool: w.name,
        args: w.args,
        decision: approved ? "approved" : "rejected",
        note,
      }))
    );

    if (approved) return new Command({ goto: "approvedTools" });

    // Rejected: every tool call still needs a ToolMessage, or the model API will error.
    return new Command({
      goto: "agent",
      update: {
        messages: last.tool_calls.map(
          (c) =>
            new ToolMessage({
              tool_call_id: c.id,
              name: c.name,
              content: `REJECTED by human reviewer. No changes were made.${note ? ` Reviewer note: ${note}` : ""}`,
            })
        ),
      },
    });
  }

  const checkpointer = process.env.USE_MEMORY_SAVER
    ? new MemorySaver()
    : new MongoDBSaver({
        client: mongoose.connection.getClient(),
        dbName: mongoose.connection.name,
      });

  return new StateGraph(MessagesAnnotation)
    .addNode("agent", agentNode)
    // readTools can only ever run read-only tools, so a write can't skip the gate.
    .addNode("readTools", new ToolNode(readTools))
    .addNode("approval", approvalNode, { ends: ["approvedTools", "agent"] })
    .addNode("approvedTools", new ToolNode(allTools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterAgent, ["approval", "readTools", END])
    .addEdge("readTools", "agent")
    .addEdge("approvedTools", "agent")
    .compile({ checkpointer });
}

let graphPromise;
export const getGraph = () => (graphPromise ??= buildGraph());
