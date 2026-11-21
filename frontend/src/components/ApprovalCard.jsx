import { useState } from "react";

const TITLES = {
  cancel_order: (a) => `Cancel order ${a.orderId}`,
  issue_refund: (a) => `Refund $${Number(a.amount).toFixed(2)} on order ${a.orderId}`,
  update_shipping_address: (a) => `Change the shipping address on ${a.orderId}`,
  create_ticket: (a) => `Open a ${a.priority ?? "normal"} priority ticket for ${a.customerEmail}`,
};

export default function ApprovalCard({ approval, busy, onDecide }) {
  const [note, setNote] = useState("");

  return (
    <section
      aria-label="Approval required"
      className="rounded-xl border border-line border-l-[6px] border-l-hold bg-hold-soft p-4"
    >
      <h2 className="font-display text-lg font-semibold">Approval needed</h2>
      <p className="mb-3 text-sm text-muted">The agent is on hold. Nothing has changed yet.</p>

      <div className="space-y-3">
        {approval.actions.map((action) => (
          <div key={action.id} className="rounded-lg border border-line bg-panel p-3">
            <p className="font-medium">
              {(TITLES[action.name] ?? (() => action.name))(action.args)}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {Object.entries(action.args).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted">{key}</dt>
                  <dd className="break-words">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <label className="mt-3 block text-sm">
        <span className="text-muted">Note for the agent (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2"
        />
      </label>

      <div className="mt-3 flex gap-2">
        <button
          disabled={busy}
          onClick={() => onDecide(true, note)}
          className="rounded-lg bg-ok px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={busy}
          onClick={() => onDecide(false, note)}
          className="rounded-lg border border-danger bg-panel px-4 py-2 font-medium text-danger disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </section>
  );
}
