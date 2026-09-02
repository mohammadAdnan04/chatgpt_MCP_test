"use client";

const loadTransformers = async () => {
  try {
    const m = await import("@xenova/transformers");
    const { pipeline } = m;
    return { pipeline };
  } catch (e) {
    return null;
  }
};

class SemanticFilterManager {
  constructor() {
    this.model = null;
    this.isInitialized = false;
    this.useAdvancedModel = false;
    this.defaultThreshold = 0.7;
    this.initializationPromise = null;
  }

  async checkAvailability() {
    try {
      const transformers = await Promise.race([
        loadTransformers(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      if (transformers) {
        this.useAdvancedModel = true;
        return true;
      }
    } catch {}
    this.useAdvancedModel = false;
    return false;
  }

  async initializeModel() {
    if (this.isInitialized) return true;
    if (!this.useAdvancedModel) {
      this.isInitialized = true;
      return true;
    }
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        const t = await loadTransformers();
        if (!t) {
          this.useAdvancedModel = false;
          this.isInitialized = true;
          return true;
        }
        const { pipeline } = t;
        this.model = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { quantized: true });
        this.isInitialized = true;
        return true;
      })();
    }
    return this.initializationPromise;
  }

  async ensureReady() {
    await this.checkAvailability();
    await this.initializeModel();
  }

  async getEmbedding(text) {
    await this.ensureReady();
    if (!this.useAdvancedModel || !this.model) throw new Error("model_unavailable");
    const out = await this.model(String(text || ""), { pooling: "mean", normalize: true });
    return Array.from(out.data);
  }

  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dp = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dp += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    if (!na || !nb) return 0;
    return dp / (Math.sqrt(na) * Math.sqrt(nb));
  }

  simpleSimilarity(x, y) {
    const a = String(x || "").toLowerCase();
    const b = String(y || "").toLowerCase();
    if (!a || !b) return 0;
    if (a === b) return 1;
    const setA = new Set(a.split(/\W+/).filter(Boolean));
    const setB = new Set(b.split(/\W+/).filter(Boolean));
    let inter = 0;
    for (const w of setA) if (setB.has(w)) inter++;
    const union = setA.size + setB.size - inter;
    return union ? inter / union : 0;
  }

  async calculateSimilarity(t1, t2) {
    try {
      if (this.useAdvancedModel) {
        const [e1, e2] = await Promise.all([this.getEmbedding(t1), this.getEmbedding(t2)]);
        return this.cosineSimilarity(e1, e2);
      }
    } catch {}
    return this.simpleSimilarity(t1, t2);
  }

  getPredefinedJobTitles() {
    return [
      "chief executive officer","ceo","chief technology officer","cto","chief financial officer","cfo",
      "chief operating officer","coo","chief marketing officer","cmo","chief information officer","cio",
      "president","vice president","vp","senior vice president","svp","executive vice president","evp",
      "director","senior director","managing director","regional director","global director",
      "manager","senior manager","general manager","project manager","program manager","product manager",
      "head of engineering","head of marketing","head of sales","head of product",
      "founder","co-founder",
      "software engineer","product manager","data scientist","marketing manager","sales manager","hr manager",
      "operations manager","vp engineering","vp sales","vp marketing"
    ];
  }

  parseJobTitleQuery(q) {
    if (!q || typeof q !== "string") return [];
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const titles = this.getPredefinedJobTitles();
    const sorted = [...titles].sort((a, b) => b.length - a.length);
    const found = [];
    let remaining = query;
    for (const t of sorted) {
      if (remaining.includes(t)) {
        found.push(t);
        remaining = remaining.replace(t, "").trim();
      }
    }
    if (found.length === 0 && remaining) return [remaining];
    return found.length ? found : [q.trim()];
  }

  async calculateJobTitleScoreWithOrLogic(jobTitleQuery, candidateJobTitle) {
    if (!jobTitleQuery || !candidateJobTitle) return 0;
    const parsed = this.parseJobTitleQuery(jobTitleQuery);
    if (!parsed.length) return 0;
    let best = 0;
    for (const t of parsed) {
      const s = await this.calculateSimilarity(t, candidateJobTitle);
      if (s > best) best = s;
    }
    return best;
  }

  calculateEmployeeNumberScore(filterCount, candidateCount) {
    if (!filterCount || filterCount <= 0) return 0;
    if (!candidateCount || candidateCount <= 0) return 0;
    const diff = Math.abs(candidateCount - filterCount) / filterCount;
    if (diff <= 0.1) return 1;
    if (diff <= 0.3) return 0.7;
    if (diff <= 0.6) return 0.4;
    return 0.1;
  }

  checkLocationGate(locationFilter, candidateLocation) {
    if (!locationFilter || !locationFilter.trim()) return true;
    if (!candidateLocation || !candidateLocation.trim()) return false;
    const fl = locationFilter.toLowerCase();
    const cl = candidateLocation.toLowerCase();
    const parts = fl.split(/[,;]|\s+or\s+|\s+and\s+/).map(p => p.trim()).filter(Boolean);
    for (const p of parts) {
      if (cl.includes(p) || p.includes(cl)) return true;
    }
    return false;
  }

  async filterResults(results, jobTitleQuery = "", industryQuery = "", locationFilter = "", employeeCountFilter = null, threshold = null) {
    if (!Array.isArray(results) || results.length === 0) return results;
    const actualThreshold = typeof threshold === "number" ? threshold : this.defaultThreshold;
    await this.ensureReady();
    const scored = await Promise.all(results.map(async r => {
      let title = "";
      if (Array.isArray(r.current_positions) && r.current_positions.length > 0) {
        title = r.current_positions[0]?.role || "";
      }
      if (!title) title = r.title || r.jobTitle || r.job_title || r.position || r.role || r.Role || "";
      let industry = "";
      if (Array.isArray(r.current_positions) && r.current_positions.length > 0) {
        const cp = r.current_positions[0];
        if (cp?.industry) {
          industry = Array.isArray(cp.industry) ? (cp.industry[0] || "") : String(cp.industry || "");
        }
      }
      if (!industry) industry = r.industry || "";
      const location = r.location || r.city || r.country || r.address || "";
      const employees = r.employee_count || r.employees || r.company_size || 0;
      const passedLocation = this.checkLocationGate(locationFilter, location);
      if (!passedLocation) {
        return { ...r, semanticScore: 0, matchStatus: "Location Mismatch", isSemanticMatch: false, gateResults: { locationGate: false, industryGate: null, finalCalculation: false } };
      }
      let industryScore = 0;
      let passedIndustryGate = true;
      const hasIndustryQuery = String(industryQuery || "").trim().length > 0;
      if (hasIndustryQuery) {
        if (industry && String(industry).trim()) {
          industryScore = await this.calculateSimilarity(industryQuery, industry);
          if (industryScore < 0.5) {
            passedIndustryGate = false;
            return { ...r, semanticScore: 0.1, matchStatus: "Poor Industry Match", isSemanticMatch: false, gateResults: { locationGate: true, industryGate: false, finalCalculation: false } };
          }
        } else {
          passedIndustryGate = false;
          return { ...r, semanticScore: 0.1, matchStatus: "No Industry Data", isSemanticMatch: false, gateResults: { locationGate: true, industryGate: false, finalCalculation: false } };
        }
      }
      let jobTitleScore = 0;
      const hasTitleQuery = String(jobTitleQuery || "").trim().length > 0;
      if (hasTitleQuery && title && String(title).trim()) {
        jobTitleScore = await this.calculateJobTitleScoreWithOrLogic(jobTitleQuery, title);
      }
      const employeeScore = this.calculateEmployeeNumberScore(employeeCountFilter, employees);
      let finalScore = 0;
      if (hasTitleQuery && hasIndustryQuery) finalScore = industryScore * 0.5 + jobTitleScore * 0.4 + employeeScore * 0.1;
      else if (hasTitleQuery) finalScore = jobTitleScore * 0.9 + employeeScore * 0.1;
      else if (hasIndustryQuery) finalScore = industryScore * 0.9 + employeeScore * 0.1;
      else finalScore = 1; // Default to 100% match if no semantic criteria provided

      let status = "No Match";
      if (finalScore >= 0.7) status = "Excellent Match"; else if (finalScore >= 0.4) status = "Good Match"; else if (finalScore >= 0.2) status = "Partial Match"; else if (finalScore >= 0.1) status = "Weak Match";
      return {
        ...r,
        semanticScore: Math.round(finalScore * 100) / 100,
        matchStatus: status,
        isSemanticMatch: finalScore >= actualThreshold,
        gateResults: { locationGate: true, industryGate: passedIndustryGate, finalCalculation: true },
        scoreBreakdown: { jobTitleScore: Math.round(jobTitleScore * 100) / 100, industryScore: Math.round(industryScore * 100) / 100, employeeNumberScore: Math.round(employeeScore * 100) / 100 },
      };
    }));
    const sorted = scored.sort((a, b) => b.semanticScore - a.semanticScore);
    return sorted;
  }
}

const semanticFilterManager = new SemanticFilterManager();
export default semanticFilterManager;

