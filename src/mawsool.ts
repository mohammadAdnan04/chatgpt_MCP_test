/** Official Mawsool API from https://docs.mawsool.tech/ (openapi.yaml). */
const APICOOL = "https://apicool.mawsool.tech";
const COOLSEARCH = "https://coolsearch.mawsool.tech";
const SEARCH_MAX_LIMIT = 50;

const MISSING_API_KEY =
  "Paste your Mawsool X-API-Key in the chat (from https://docs.mawsool.tech/), then try again.";

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
      },
      body: method === "GET" ? undefined : JSON.stringify(opts?.body || {}),
    });
    const raw = await response.text();
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {
        error: `Mawsool API returned ${response.status} (not JSON): ${String(raw)
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
      data: { error: e.message || "Mawsool API request failed" },
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
  const { data, isError } = await mawsoolFetch(key, "GET", `${APICOOL}/credits`);
  if (isError) return { error: data.error || "Failed to load credits" };
  return {
    ...data,
    creditsRemaining: creditsFrom(data),
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

  const result = await mawsoolFetch(key, "POST", `${COOLSEARCH}/search`, {
    body: {
      type,
      page: safePage,
      limit: safeLimit,
      filters: input.filters && typeof input.filters === "object" ? input.filters : {},
    },
  });
  if (!result.isError) {
    result.data = {
      ...result.data,
      creditsRemaining: creditsFrom(result.data),
      page: safePage,
      limitApplied: safeLimit,
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

  let result = await mawsoolFetch(key, "GET", `${APICOOL}/contact`, {
    params: { url: input.url, fields: input.fields, country: input.country },
  });

  if (result.status === 202 || result.data?.retry_needed || result.data?.status === "processing") {
    return {
      data: {
        error: "Enrichment is in progress. Retry the same request in 30–60 seconds.",
        retry_needed: true,
        status: "processing",
      },
      isError: true,
    };
  }

  if (!result.isError) {
    result.data = {
      ...result.data,
      creditsRemaining: creditsFrom(result.data),
    };
  }
  return result;
}

export async function fullInfoMawsool(apiKey: string | undefined, url?: string) {
  const key = requireKey(apiKey);
  if (!key) return { data: { error: MISSING_API_KEY }, isError: true };
  if (!url) return { data: { error: "url is required" }, isError: true };

  const result = await mawsoolFetch(key, "GET", `${APICOOL}/full-info`, {
    params: { url },
  });
  if (!result.isError) {
    result.data = {
      ...result.data,
      creditsRemaining: creditsFrom(result.data),
    };
  }
  return result;
}
