const clients = new Map();
function subscribe(userId, res) {
  const id = String(userId || "");
  if (!id) return;
  let set = clients.get(id);
  if (!set) {
    set = new Set();
    clients.set(id, set);
  }
  set.add(res);
  res.on("close", () => {
    const s = clients.get(id);
    if (s) {
      s.delete(res);
      if (s.size === 0) clients.delete(id);
    }
  });
}
function emit(userId, payload) {
  const id = String(userId || "");
  const set = clients.get(id);
  if (!set || set.size === 0) return;
  const data = JSON.stringify(payload || {});
  for (const res of set) {
    try {
      res.write(`event: reveal-recorded\n`);
      res.write(`data: ${data}\n\n`);
    } catch {}
  }
}
module.exports = { subscribe, emit };
