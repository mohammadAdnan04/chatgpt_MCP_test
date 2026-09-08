import { useState } from "react";
import { useViewState } from "skybridge/web";
import Shell from "./components/shell.js";
import { callHostTool, useCallTool, useToolInfo } from "../helpers.js";

type Person = {
  url?: string;
  linkedin_url?: string;
  public_profile_url?: string;
  profile_url?: string;
  public_identifier?: string;
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

function profileUrl(row: Person): string {
  const raw =
    row.url ||
    row.linkedin_url ||
    row.public_profile_url ||
    row.profile_url ||
    "";
  const trimmed = String(raw).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const id = String(row.public_identifier || trimmed).replace(/^\/+|\/+$/g, "");
  if (id && !id.includes(" ")) return `https://www.linkedin.com/in/${id}`;
  return "";
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Tool call failed";
  }
}

export default function Search() {
  const { output, input } = useToolInfo();
  const revealTool = useCallTool("contact-only");
  const saveTool = useCallTool("save-to-list");
  const [ui, setUi] = useViewState({ listName: "Outreach from ChatGPT" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"reveal" | "save" | "">("");
  const rows = rowsFrom(output as Record<string, unknown> | undefined);

  async function runTool(name: string, args: Record<string, unknown>, fallback: () => Promise<any>) {
    try {
      return await callHostTool(name, args);
    } catch (first) {
      try {
        return await fallback();
      } catch (second) {
        throw second || first;
      }
    }
  }

  async function onReveal(row: Person) {
    const url = profileUrl(row);
    if (!url) {
      setNotice("This row has no LinkedIn URL, so Reveal cannot run.");
      return;
    }
    setNotice("Revealing contact…");
    setBusy("reveal");
    try {
      const result: any = await runTool(
        "contact-only",
        { url, fields: "email,phone" },
        () => revealTool.callToolAsync({ url, fields: "email,phone" } as any),
      );
      setNotice(
        result?.isError
          ? String(result?.structuredContent?.error || result?.error || "Reveal failed")
          : "Reveal finished. Check the new contact card in this chat.",
      );
    } catch (err) {
      setNotice(`Reveal failed: ${errorText(err)}`);
    } finally {
      setBusy("");
    }
  }

  async function onSave(row: Person) {
    const url = profileUrl(row);
    if (!url) {
      setNotice("This row has no LinkedIn URL, so Save cannot run.");
      return;
    }
    setNotice("Saving to list…");
    setBusy("save");
    try {
      const payload = {
        list_name: ui.listName,
        create_if_missing: true,
        profiles: [
          {
            url,
            name: displayName(row),
            first_name: row.first_name,
            last_name: row.last_name,
            title: row.title,
            company: row.company,
            headline: row.headline,
          },
        ],
      };
      const result: any = await runTool("save-to-list", payload, () =>
        saveTool.callToolAsync(payload as any),
      );
      setNotice(
        result?.isError
          ? String(result?.structuredContent?.error || result?.error || "Save failed")
          : `Saved to ${ui.listName}`,
      );
    } catch (err) {
      setNotice(`Save failed: ${errorText(err)}`);
    } finally {
      setBusy("");
    }
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
        {rows.map((row, i) => {
          const url = profileUrl(row);
          return (
            <div
              key={url || String(i)}
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
                  className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
                  disabled={!url || busy === "reveal"}
                  onClick={() => onReveal(row)}
                >
                  {busy === "reveal" ? "Revealing…" : "Reveal"}
                </button>
                <button
                  type="button"
                  className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
                  disabled={!url || busy === "save"}
                  onClick={() => onSave(row)}
                >
                  {busy === "save" ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
