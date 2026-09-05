import { getApicoolUrl, getSearchApiUrl } from "./config.js";

const SEARCH_MAX_LIMIT = 25;
const MISSING_API_KEY =
  "Paste your Mawsool API key in the chat, then try again. This is the X-API-Key from api.mawsool.tech — not a website login.";

function requireKey(apiKey: string | undefined): string | null {
  const key = String(apiKey || "").trim();
  return key || null;
}

async function mawsoolFetch(
  apiKey: string,
  method: string,
  url: string,
  opts?: { params?: Record<string, unknown>; body?: Record<string, unknown> },
): Promise<{ data: any; isError: boolean; status: number }> {
  const u = new URL(url);
  if (opts?.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        u.searchParams.set(k, String(v));
      }
    }
  }

  try {
    const response = await fetch(u.toString(), {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "x-api-key": apiKey,
        "User-Agent": "MawsoolChatGPT-MCP/1.0",
      },
      body: method === "GET" ? undefined : JSON.stringify(opts?.body || {}),
    });
    const raw = await response.text();
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {
        error: `Upstream returned ${response.status} (not JSON): ${String(raw)
          .slice(0, 180)
          .replace(/\s+/g, " ")}`,
      };
    }
    const errText =
      data.error_description ||
      data.error ||
      data.message ||
      (response.ok ? null : `Request failed (${response.status})`);
    if (!response.ok || data.status === "error" || data.error) {
      return {
        status: response.status,
        isError: true,
        data: { ...data, error: errText || `Request failed (${response.status})` },
      };
    }
    return { status: response.status, isError: false, data };
  } catch (e: any) {
    return {
      status: 502,
      isError: true,
      data: { error: e.message || "Upstream request failed" },
    };
  }
}

function creditsFrom(data: any): number | undefined {
  const n = data?.creditsRemaining ?? data?.credits ?? data?.balance ?? data?.remaining_credits;
  return typeof n === "number" ? n : undefined;
}

export async function fetchAccountCredits(apiKey?: string) {
  const key = requireKey(apiKey);
  if (!key) return { error: MISSING_API_KEY };
  const { data, isError } = await mawsoolFetch(key, "GET", `${getApicoolUrl()}/credits`);
  if (isError) return { error: data.error || "Failed to load credits" };
  const creditsRemaining = creditsFrom(data);
  return {
    ...data,
    creditsRemaining,
    source: "apicool",
  };
}

export async function searchMawsool(
  apiKey: string | undefined,
  input: {
    filters?: Record<string, unknown>;
    search_type?: string;
    page?: number;
    limit?: number;
  },
) {
  const key = requireKey(apiKey);
  if (!key) return { data: { error: MISSING_API_KEY }, isError: true };

  const type =
    String(input.search_type || "people").toLowerCase() === "companies" ? "companies" : "people";
  const requested = Number(input.limit) || 10;
  const safeLimit = Math.min(Math.max(1, requested), SEARCH_MAX_LIMIT);
  const safePage = Math.max(1, Number(input.page) || 1);

  const result = await mawsoolFetch(key, "POST", `${getSearchApiUrl()}/search`, {
    body: {
      filters: input.filters && typeof input.filters === "object" ? input.filters : {},
      page: safePage,
      limit: safeLimit,
      type,
    },
  });
  if (!result.isError) {
    result.data = {
      ...result.data,
      creditsRemaining: creditsFrom(result.data),
      page: safePage,
      limitApplied: safeLimit,
      source: "search_api",
    };
  }
  return result;
}

export async function contactMawsool(
  apiKey: string | undefined,
  input: { url?: string; fields?: string; country?: string },
) {
  const key = requireKey(apiKey);
  if (!key) return { data: { error: MISSING_API_KEY }, isError: true };
  if (!input.url || !input.fields) {
    return { data: { error: "url and fields are required" }, isError: true };
  }

  let result = await mawsoolFetch(key, "GET", `${getApicoolUrl()}/contact`, {
    params: { url: input.url, fields: input.fields, country: input.country },
  });

  if (result.status === 202 || result.data?.retry_needed) {
    await new Promise((r) => setTimeout(r, 8000));
    result = await mawsoolFetch(key, "GET", `${getApicoolUrl()}/contact`, {
      params: { url: input.url, fields: input.fields, country: input.country },
    });
    if (result.status === 202 || result.data?.retry_needed) {
      return {
        data: {
          error: "Taking longer than expected. Ask me to retry in 30 seconds.",
          retry_needed: true,
        },
        isError: true,
      };
    }
  }

  if (!result.isError) {
    result.data = {
      ...result.data,
      creditsRemaining: creditsFrom(result.data),
      source: "apicool",
    };
  }
  return result;
}

export async function fullInfoMawsool(apiKey: string | undefined, url?: string) {
  const key = requireKey(apiKey);
  if (!key) return { data: { error: MISSING_API_KEY }, isError: true };
  if (!url) return { data: { error: "url is required" }, isError: true };

  const result = await mawsoolFetch(key, "GET", `${getApicoolUrl()}/full-info`, {
    params: { url },
  });
  if (!result.isError) {
    result.data = {
      ...result.data,
      creditsRemaining: creditsFrom(result.data),
      source: "apicool",
    };
  }
  return result;
}
