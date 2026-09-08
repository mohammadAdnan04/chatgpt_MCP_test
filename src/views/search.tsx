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

type RowDetail = {
  emails?: string[];
  phones?: string[];
  savedTo?: string;
  error?: string;
  creditsRemaining?: number;
};

type SearchUi = {
  listName: string;
  details: Record<string, RowDetail>;
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

function unwrapPayload(result: any): Record<string, unknown> {
  if (!result || typeof result !== "object") return {};
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as Record<string, unknown>;
  }
  if (result.result && typeof result.result === "object") {
    return unwrapPayload(result.result);
  }
  const text = Array.isArray(result.content)
    ? result.content.map((c: any) => c?.text).filter(Boolean).join("\n")
    : "";
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // keep raw result
    }
  }
  return result as Record<string, unknown>;
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const s = String(value || "").trim();
    if (s && s.toLowerCase() !== "not available" && !out.includes(s)) out.push(s);
  }
  return out;
}

function emailsFrom(payload: Record<string, unknown>): string[] {
  const all = Array.isArray(payload.contact__all_emails) ? payload.contact__all_emails : [];
  return uniqueStrings([
    payload.contact__email,
    payload.email,
    ...(Array.isArray(payload.emails) ? payload.emails : []),
    ...all.map((e: any) => e?.email || e?.sanitized_email || e),
  ]);
}

function phonesFrom(payload: Record<string, unknown>): string[] {
  const arr = Array.isArray(payload.contact__phone_numbers)
    ? payload.contact__phone_numbers
    : Array.isArray(payload.phones)
      ? payload.phones
      : [];
  if (arr.length) {
    return uniqueStrings(
      arr.map((p: any) => {
        const num = p?.sanitized_number || p?.raw_number || p?.number || p;
        const type = p?.type ? ` (${p.type})` : "";
        return num ? `${num}${type}` : "";
      }),
    );
  }
  return uniqueStrings(String(payload.phone || payload.contactPhone || "").split(","));
}

export default function Search() {
  const { output, input } = useToolInfo();
  const revealTool = useCallTool("contact-only");
  const saveTool = useCallTool("save-to-list");
  const [ui, setUi] = useViewState<SearchUi>({
    listName: "Outreach from ChatGPT",
    details: {},
  });
  const [notice, setNotice] = useState("");
  const [busyUrl, setBusyUrl] = useState("");
  const [busyKind, setBusyKind] = useState<"reveal" | "save" | "">("");
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

  function patchDetail(url: string, patch: RowDetail) {
    setUi((prev) => ({
      ...prev,
      details: {
        ...prev.details,
        [url]: { ...prev.details[url], ...patch },
      },
    }));
  }

  async function onReveal(row: Person) {
    const url = profileUrl(row);
    if (!url) {
      setNotice("This row has no LinkedIn URL, so Reveal cannot run.");
      return;
    }
    setNotice("Revealing contact…");
    setBusyUrl(url);
    setBusyKind("reveal");
    try {
      const result: any = await runTool(
        "contact-only",
        { url, fields: "email,phone" },
        () => revealTool.callToolAsync({ url, fields: "email,phone" } as any),
      );
      const payload = unwrapPayload(result);
      const failed = Boolean(result?.isError || payload.error);
      const emails = emailsFrom(payload);
      const phones = phonesFrom(payload);
      const creditsRemaining =
        typeof payload.creditsRemaining === "number" ? payload.creditsRemaining : undefined;
      patchDetail(url, {
        emails,
        phones,
        creditsRemaining,
        error: failed
          ? String(payload.error_description || payload.error || "Reveal failed")
          : undefined,
      });
      if (failed) {
        setNotice(String(payload.error_description || payload.error || "Reveal failed"));
      } else if (!emails.length && !phones.length) {
        setNotice("Reveal finished, but no email or phone was returned for this profile.");
      } else {
        setNotice(
          `Revealed ${displayName(row)}: ${[...emails, ...phones].join(" · ")}${
            typeof creditsRemaining === "number"
              ? ` · ${creditsRemaining.toLocaleString()} credits left`
              : ""
          }`,
        );
      }
    } catch (err) {
      const message = errorText(err);
      patchDetail(url, { error: message });
      setNotice(`Reveal failed: ${message}`);
    } finally {
      setBusyUrl("");
      setBusyKind("");
    }
  }

  async function onSave(row: Person) {
    const url = profileUrl(row);
    if (!url) {
      setNotice("This row has no LinkedIn URL, so Save cannot run.");
      return;
    }
    setNotice("Saving to list…");
    setBusyUrl(url);
    setBusyKind("save");
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
      const body = unwrapPayload(result);
      const failed = Boolean(result?.isError || body.error);
      if (failed) {
        const message = String(body.error_description || body.error || "Save failed");
        patchDetail(url, { error: message });
        setNotice(message);
      } else {
        patchDetail(url, { savedTo: ui.listName, error: undefined });
        setNotice(`Saved ${displayName(row)} to ${ui.listName}`);
      }
    } catch (err) {
      const message = errorText(err);
      patchDetail(url, { error: message });
      setNotice(`Save failed: ${message}`);
    } finally {
      setBusyUrl("");
      setBusyKind("");
    }
  }

  const latestCredits = Object.values(ui.details)
    .map((d) => d.creditsRemaining)
    .find((n) => typeof n === "number");
  const credits =
    typeof latestCredits === "number"
      ? latestCredits
      : typeof output?.creditsRemaining === "number"
        ? output.creditsRemaining
        : null;

  return (
    <Shell
      title="Search results"
      subtitle={`${String(input?.search_type || "people")} · page ${String(input?.page || 1)}`}
    >
      {output?.error ? (
        <p className="text-sm text-destructive">{String(output.error)}</p>
      ) : null}
      {credits !== null ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Credits remaining: {credits.toLocaleString()}
        </p>
      ) : null}
      <label className="mb-3 flex items-center gap-2 text-sm">
        List
        <input
          className="flex-1 rounded border border-border bg-background px-2 py-1"
          value={ui.listName}
          onChange={(e) => setUi((prev) => ({ ...prev, listName: e.target.value }))}
        />
      </label>
      {notice ? <p className="mb-2 text-sm">{notice}</p> : null}
      <div className="flex flex-col gap-2">
        {rows.length === 0 && !output?.error ? (
          <p className="text-sm text-muted-foreground">No rows in this page.</p>
        ) : null}
        {rows.map((row, i) => {
          const url = profileUrl(row);
          const detail = url ? ui.details[url] : undefined;
          const revealing = busyUrl === url && busyKind === "reveal";
          const saving = busyUrl === url && busyKind === "save";
          return (
            <div key={url || String(i)} className="flex flex-col gap-2 rounded border border-border p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
                    disabled={!url || Boolean(busyKind)}
                    onClick={() => onReveal(row)}
                  >
                    {revealing ? "Revealing…" : "Reveal"}
                  </button>
                  <button
                    type="button"
                    className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
                    disabled={!url || Boolean(busyKind)}
                    onClick={() => onSave(row)}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
              {detail?.error ? (
                <p className="text-sm text-destructive">{detail.error}</p>
              ) : null}
              {detail?.emails?.length || detail?.phones?.length ? (
                <div className="rounded bg-muted/40 p-2 text-sm">
                  {detail.emails?.length ? (
                    <p>
                      <span className="text-muted-foreground">Email: </span>
                      {detail.emails.join(", ")}
                    </p>
                  ) : null}
                  {detail.phones?.length ? (
                    <p>
                      <span className="text-muted-foreground">Phone: </span>
                      {detail.phones.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {detail?.savedTo ? (
                <p className="text-sm text-muted-foreground">Saved to {detail.savedTo}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
