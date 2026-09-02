import saudiSampleLeads from "@/data/saudiSampleLeads.json";

export const REAL_SEARCH_KEY = "hasMadeRealSearch";
export const SAMPLE_TOTAL_LABEL = "1B";
export const SAMPLE_TOTAL_COUNT = 1000000000;

export const hasMadeRealSearch = () => {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(REAL_SEARCH_KEY) === "true";
};

export const markRealSearch = () => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(REAL_SEARCH_KEY, "true");
};

export const clearRealSearchFlag = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(REAL_SEARCH_KEY);
};

export const pickSampleLeads = (count = 10) => {
  const pool = Array.isArray(saudiSampleLeads) ? [...saudiSampleLeads] : [];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, Math.min(count, pool.length));
};

export const getSampleSearchResult = (count = 10) => {
  const items = pickSampleLeads(count);
  return {
    items,
    total: SAMPLE_TOTAL_LABEL,
    paging: {
      start: 0,
      page_count: items.length,
      total_count: SAMPLE_TOTAL_COUNT,
    },
    searchMode: "people",
    samplePreview: true,
  };
};
