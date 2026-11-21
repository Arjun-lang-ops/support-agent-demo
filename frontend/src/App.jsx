import { useEffect, useRef, useState } from "react";
import { sendMessage, decide, loadThread } from "./api";
import Message from "./components/Message.jsx";
import ApprovalCard from "./components/ApprovalCard.jsx";

const SAMPLES = [
  "Where is order ORD-1001? My email is priya@example.com",
  "Cancel ORD-1001, I picked the wrong size. I'm priya@example.com",
  "Refund $40 on ORD-1002, the jacket arrived scuffed (priya@example.com)",
  "I want a full refund on ORD-1004 (marco@example.com)",
  "Show me delivered orders over $200",
];

const newThreadId = () => crypto.randomUUID();

export default function App() {
  const [threadId, setThreadId] = useState(() => localStorage.getItem("threadId") || newThreadId());
  const [messages, setMessages] = useState([]);
  const [approval, setApproval] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  const apply = (snap) => {
    setMessages(snap.messages);
    setApproval(snap.approval);
    setError(snap.error || "");
  };

  useEffect(() => {
    localStorage.setItem("threadId", threadId);
    loadThread(threadId).then(apply).catch((e) => setError(e.message));
  }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, approval, busy]);

  async function onSend(text) {
    const msg = text.trim();
    if (!msg || busy || approval) return;
    setInput("");
    setBusy(true);
    setError("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    try {
      apply(await sendMessage(threadId, msg));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDecide(approved, note) {
    setBusy(true);
    setError("");
    try {
      apply(await decide(threadId, approved, note));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function newConversation() {
    setMessages([]);
    setApproval(null);
    setThreadId(newThreadId());
  }

  return (
    <div className="mx-auto flex h-dvh max-w-5xl gap-6 p-4">
      <aside className="hidden w-64 shrink-0 flex-col gap-3 md:flex">
        <h1 className="font-display text-2xl font-bold">Support console</h1>
        <p className="text-sm text-muted">
          Aria reads orders on her own. Any change waits for your approval.
        </p>
        <p className="mt-2 text-sm font-medium">Try one of these</p>
        <ul className="space-y-2">
          {SAMPLES.map((s) => (
            <li key={s}>
              <button
                onClick={() => onSend(s)}
                disabled={busy || !!approval}
                className="w-full rounded-lg border border-line bg-panel p-2.5 text-left text-sm hover:border-signal disabled:opacity-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
        <button onClick={newConversation} className="mt-auto text-left text-sm text-signal underline">
          Start a new conversation
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-paper">
        <div aria-live="polite" className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && !busy && (
            <p className="text-muted">Ask about an order to get started.</p>
          )}
          {messages.map((m, i) => (
            <Message key={i} message={m} />
          ))}
          {approval && <ApprovalCard approval={approval} busy={busy} onDecide={onDecide} />}
          {busy && <p className="text-sm text-muted">Aria is working…</p>}
          {error && (
            <p role="alert" className="rounded-lg border border-danger bg-panel p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div ref={endRef} />
        </div>

        <div className="flex gap-2 border-t border-line p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend(input)}
            disabled={busy || !!approval}
            placeholder={approval ? "Approve or reject the action above first" : "Type a message"}
            aria-label="Message"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 disabled:opacity-60"
          />
          <button
            onClick={() => onSend(input)}
            disabled={busy || !!approval || !input.trim()}
            className="rounded-lg bg-signal px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
