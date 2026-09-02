export type ToolLogEntry = {
  id: number;
  ts: string;
  src: "mawsool-mcp";
  event: "tool";
  tool: string;
  email: string | null;
  clientId: string | null;
  ms: number;
  isError: boolean;
  path: string | null;
  req: unknown;
  res: unknown;
};

const MAX_LOGS = 500;
const entries: ToolLogEntry[] = [];
let nextId = 1;

export function recordToolLog(
  fields: Omit<ToolLogEntry, "id" | "ts" | "src" | "event">,
): ToolLogEntry {
  const entry: ToolLogEntry = {
    id: nextId++,
    ts: new Date().toISOString(),
    src: "mawsool-mcp",
    event: "tool",
    ...fields,
  };
  entries.push(entry);
  if (entries.length > MAX_LOGS) entries.shift();
  return entry;
}

export function listToolLogs(opts: {
  limit?: number;
  tool?: string;
  email?: string;
}): { stored: number; returned: number; logs: ToolLogEntry[] } {
  let list = entries.slice().reverse();
  const tool = String(opts.tool || "").trim();
  const email = String(opts.email || "").trim().toLowerCase();
  if (tool) list = list.filter((e) => e.tool === tool);
  if (email) list = list.filter((e) => (e.email || "").toLowerCase() === email);
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), MAX_LOGS);
  const logs = list.slice(0, limit);
  return { stored: entries.length, returned: logs.length, logs };
}

export function clearToolLogs(): { cleared: number } {
  const cleared = entries.length;
  entries.length = 0;
  return { cleared };
}
