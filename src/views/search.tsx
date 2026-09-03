import { useState } from "react";
import { useViewState } from "skybridge/web";
import Shell from "./components/shell.js";
import { useCallTool, useToolInfo } from "../helpers.js";

type Person = {
  url?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  headline?: string;
};

function rowsFrom(output: Record<string, unknown> | undefined): Person[] {
  if (!output) return [];
  const list = output.items || output.results || output.data || output.people;
  return Array.isArray(list) ? (list as Person[]) : [];
}

function displayName(row: Person) {
  return (
    row.name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    row.headline ||
    "Unknown"
  );
}

export default function Search() {
  const { output, input } = useToolInfo();
  const { callTool: reveal, isPending: revealing } = useCallTool("contact-only");
  const { callTool: save, isPending: saving } = useCallTool("save-to-list");
  const [ui, setUi] = useViewState({ listName: "Outreach from ChatGPT" });
  const [notice, setNotice] = useState("");
  const rows = rowsFrom(output as Record<string, unknown> | undefined);

  async function onReveal(row: Person) {
    if (!row.url) return;
    setNotice("");
    const result: any = await reveal({ url: row.url, fields: "email,phone" });
    setNotice(result.isError ? "Reveal failed" : "Reveal requested");
  }

  async function onSave(row: Person) {
    if (!row.url) return;
    setNotice("");
    const result: any = await save({
      list_name: ui.listName,
      create_if_missing: true,
      profiles: [
        {
          url: row.url,
          name: displayName(row),
          first_name: row.first_name,
          last_name: row.last_name,
          title: row.title,
          company: row.company,
          headline: row.headline,
        },
      ],
    });
    setNotice(result.isError ? "Save failed" : `Saved to ${ui.listName}`);
  }

  return (
    <Shell
      title="Search results"
      subtitle={`${String(input?.search_type || "people")} · page ${String(input?.page || 1)}`}
    >
      {output?.error ? (
        <p className="text-sm text-destructive">{String(output.error)}</p>
      ) : null}
      {typeof output?.creditsRemaining === "number" ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Credits remaining: {output.creditsRemaining.toLocaleString()}
        </p>
      ) : null}
      <label className="mb-3 flex items-center gap-2 text-sm">
        List
        <input
          className="flex-1 rounded border border-border bg-background px-2 py-1"
          value={ui.listName}
          onChange={(e) => setUi({ listName: e.target.value })}
        />
      </label>
      {notice ? <p className="mb-2 text-sm">{notice}</p> : null}
      <div className="flex flex-col gap-2">
        {rows.length === 0 && !output?.error ? (
          <p className="text-sm text-muted-foreground">No rows in this page.</p>
        ) : null}
        {rows.map((row, i) => (
          <div
            key={row.url || String(i)}
            className="flex flex-col gap-2 rounded border border-border p-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{displayName(row)}</p>
              <p className="truncate text-sm text-muted-foreground">
                {[row.title, row.company].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded border border-border px-3 py-1 text-sm"
                disabled={!row.url || revealing}
                onClick={() => onReveal(row)}
              >
                Reveal
              </button>
              <button
                type="button"
                className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
                disabled={!row.url || saving}
                onClick={() => onSave(row)}
              >
                Save
              </button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
