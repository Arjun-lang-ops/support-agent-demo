# Autonomous Customer Support Agent

LangGraph.js agent + custom MongoDB tools + human-in-the-loop (HITL) approval gate, with a React console.

```
React (Vite) ──/api──▶ Express ──▶ LangGraph graph ──▶ MongoDB (data + checkpoints + audit log)

START ─▶ agent ──no tool calls──────────────▶ END
           │
           ├─ read tools only ─▶ readTools ──▶ agent
           │
           └─ any write tool ──▶ approval (interrupt) ─┬ approved ─▶ approvedTools ─▶ agent
                                                       └ rejected ─▶ agent (with REJECTED message)
```

## Step by step

### 1. Prerequisites
Node 20+, a MongoDB instance (local or Atlas), and an OpenAI or Anthropic API key.

### 2. Backend setup
```bash
cd backend
npm i express cors dotenv mongoose zod@3 @langchain/core @langchain/langgraph @langchain/langgraph-checkpoint-mongodb
npm i @langchain/openai        # or: npm i @langchain/anthropic
cp .env.example .env           # fill in MONGODB_URI, LLM_PROVIDER, API key
npm run seed                   # 2 customers, 4 orders
npm run dev                    # http://localhost:4000
```

### 3. Frontend setup
```bash
cd frontend
npm i react react-dom
npm i -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
npm run dev                    # http://localhost:5173 (proxies /api to :4000)
```

### 4. Try it
| Prompt | What should happen |
|---|---|
| "Where is ORD-1001? I'm priya@example.com" | Read tools run, no approval |
| "Cancel ORD-1001, wrong size" | Approval card, then cancelled on Approve |
| "Refund $40 on ORD-1002, scuffed" | Approval card for the refund |
| "Full refund on ORD-1004" (marco@example.com) | Over $500: tool returns an error, agent opens a ticket (approval) |
| Click Reject on any card | Nothing changes; agent asks what to do instead |

Check `auditlogs` in MongoDB for every approve/reject decision.

## How each part works

| File | Role |
|---|---|
| `agent/tools.js` | Zod-schema tools. 4 read-only, 4 write. Whitelisted `query_orders` filter builder (no raw Mongo filters), `maxTimeMS`, row limits. Errors returned as data so the model recovers. |
| `agent/graph.js` | StateGraph: ReAct loop (agent ⇄ tools), router, `interrupt()` approval node, Mongo checkpointer. |
| `controllers/chat.controller.js` | `/chat` runs the graph. `/approve` resumes it with `Command({ resume })`. Recursion limit (15) and 60 s timeout. |
| `frontend/src/App.jsx` | Chat UI. Input is locked while an approval is pending. |
| `frontend/src/components/ApprovalCard.jsx` | Shows exactly what will change, with Approve / Reject and a note. |

### The HITL mechanism
1. The model emits a write tool call. `routeAfterAgent` sends it to `approval`.
2. `interrupt(payload)` pauses the run. State is saved by `MongoDBSaver`, keyed by `thread_id`. The API returns `status: "pending_approval"`.
3. React shows the card. The user clicks Approve or Reject, which calls `/approve`.
4. The graph resumes with `Command({ resume: { approved, note } })`. `interrupt()` returns that value, the decision is written to the audit log, and the graph routes to execution or back to the agent.

Because the pause lives in the checkpointer, it survives server restarts and long waits.

## Guardrails in this build
- **Write isolation:** the `readTools` node only contains read tools, so a write can't bypass the gate.
- **Policy in code:** refund cap, status checks, and atomic `findOneAndUpdate` conditions run even after approval.
- **Loop limits:** `recursionLimit` plus an `AbortSignal` timeout; both return a friendly error to the UI.
- **Input validation:** Zod on every tool and every API body.
- **Audit trail:** every decision stored with tool, args, note.

## Before production
- Add real auth and bind each `thread_id` to a logged-in customer; never trust an email typed in chat.
- Put approvals behind a separate agent-staff login (customers must not approve their own refunds).
- Stream responses (`graph.stream`) and add tracing (LangSmith) to debug trajectories.
- Add evals: a fixed set of prompts asserting which tools are called and that no write runs unapproved.
- Next steps from your curriculum: split into supervisor + billing/shipping workers, and expose the read tools through an MCP server.
