const WRITE_TOOLS = new Set(["cancel_order", "issue_refund", "update_shipping_address", "create_ticket"]);

function chipLabel({ name, args }) {
  const first = Object.values(args ?? {})[0];
  return `${name.replaceAll("_", " ")}${first ? `: ${first}` : ""}`;
}

export default function Message({ message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-white">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[85%] space-y-2">
      {message.toolCalls?.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {message.toolCalls.map((t, i) => (
            <li
              key={i}
              className={`rounded-md border px-2 py-0.5 text-xs ${
                WRITE_TOOLS.has(t.name)
                  ? "border-hold bg-hold-soft text-ink"
                  : "border-line bg-panel text-muted"
              }`}
            >
              {chipLabel(t)}
            </li>
          ))}
        </ul>
      )}
      {message.content && (
        <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-line bg-panel px-4 py-2.5">
          {message.content}
        </p>
      )}
    </div>
  );
}
