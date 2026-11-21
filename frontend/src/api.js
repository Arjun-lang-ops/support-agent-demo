async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const sendMessage = (threadId, message) =>
  request("/chat", { method: "POST", body: JSON.stringify({ threadId, message }) });

export const decide = (threadId, approved, note) =>
  request("/approve", { method: "POST", body: JSON.stringify({ threadId, approved, note }) });

export const loadThread = (threadId) => request(`/thread/${threadId}`);
