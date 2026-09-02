import { isLikelyCorporatePhoneNumber, isLikelyMobilePhoneNumber } from "@/utils/phoneType";

export const orgHeaders = [
  "First Name",
  "Last Name",
  "Job Title",
  "Company",
  "Business Email 1",
  "Business Email 1 Status",
  "Business Email 2",
  "Business Email 2 Status",
  "Personal Email 1",
  "Personal Email 1 Status",
  "Personal Email 2",
  "Personal Email 2 Status",
  "Headline",
  "Seniority",
  "Departments",
  "Mobile Phone",
  "Second Phone",
  "Other Numbers 1",
  "Corporate Phone",
  "# Employees",
  "Industry",
  "Keywords",
  "Person LinkedIn URL",
  "Website",
  "Company Linkedin Url",
  "Facebook Url",
  "Twitter Url",
  "City",
  "Country",
  "Company Address",
  "Company City",
  "Company Country",
  "Technologies",
  "Founded Year",
  "Annual Revenue",
  "Total Funding",
  "Latest Funding",
  "Latest Funding Amount",
  "Last Raised At",
];

export const companiesHeaders = [
  "Company Name",
  "# Employees",
  "Industry",
  "Website",
  "Company Linkedin Url",
  "Facebook Url",
  "Twitter Url",
  "Company Street",
  "Company City",
  "Company State",
  "Company Country",
  "Company Postal Code",
  "Company Address",
  "Keywords",
  "Company Phone",
  "Technologies",
  "Total Funding",
  "Latest Funding",
  "Latest Funding Amount",
  "Last Raised At",
  "Annual Revenue",
  "Short Description",
  "Founded Year"
];

const q = (v) => {
  const s = v == null ? "" : String(v);
  const t = s.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${t}"`;
};

const isPersonal = (email) => {
  const d = String(email).split("@")[1] || "";
  const p = ["gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","live.com","mail.com"]; 
  return p.includes(d.toLowerCase());
};

const pickEmails = (raw) => {
  const src = Array.isArray(raw.contact__all_emails) ? raw.contact__all_emails : (Array.isArray(raw.contact__emails) ? raw.contact__emails : []);
  const list = [];
  src.forEach((e)=>{
    const addr = e?.email || e?.sanitized_email;
    if (!addr) return;
    list.push({ email: addr, status: e?.verificationStatus || e?.status || raw.email_status || "" });
  });
  if (!list.length && typeof raw.email === "string" && raw.email.trim()) {
    raw.email.split(/[;,]+/).map((s)=>s.trim()).filter(Boolean).forEach((em)=> list.push({ email: em, status: raw.email_status || "" }));
  }
  const biz = list.filter((x)=> !isPersonal(x.email));
  const per = list.filter((x)=> isPersonal(x.email));
  return { biz, per };
};

const phonePretty = (num) => {
  if (!num) return "";
  const clean = String(num).replace(/[^+\d]/g, "");
  const m = clean.match(/^\+(\d{1,3})(\d*)$/);
  if (!m) return clean;
  const cc = `+${m[1]}`;
  const rest = m[2];
  const len = rest.length;
  let groups = [];
  if (len === 8) {
    groups = [rest.slice(0,1), rest.slice(1,4), rest.slice(4)];
  } else if (len === 9) {
    groups = [rest.slice(0,2), rest.slice(2,5), rest.slice(5)];
  } else if (len === 10) {
    groups = [rest.slice(0,3), rest.slice(3,6), rest.slice(6)];
  } else if (len > 4) {
    const head = rest.slice(0, len-4);
    const tail = rest.slice(len-4);
    // split head into chunks of 3 from left
    const chunks = head.replace(/(\d{3})(?=\d)/g, "$1 ").split(" ");
    groups = [...chunks, tail];
  } else {
    groups = [rest];
  }
  return `${cc} ${groups.filter(Boolean).join(" ")}`.trim();
};

const parseTypedStrings = (s) => {
  const out = [];
  if (!s) return out;
  s.split(",").map((v)=> v.trim()).filter(Boolean).forEach((v)=>{
    const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    const num = m ? m[1].trim() : v;
    const type = m ? m[2].trim().toLowerCase() : "";
    out.push({ num, type });
  });
  return out;
};

const canon = (num) => String(num || "").replace(/[^+\d]/g, "");

const pickPhones = (raw) => {
    const arr = Array.isArray(raw.contact__phone_numbers) ? raw.contact__phone_numbers : [];
    let out = arr.map((p)=> ({ num: p?.sanitized_number || p?.raw_number || "", type: (p?.type || "").toLowerCase() }))
      .filter((x)=> x.num);
    // Fallbacks from string fields
    out = out.concat(parseTypedStrings(raw.phone));
    out = out.concat(parseTypedStrings(raw.second_phone));
    out = out.concat(parseTypedStrings(raw.corporate_phone).map((x) => ({ ...x, type: x.type || "corporate" })));
    // Deduplicate
    const dedup = [];
    out.forEach((x)=> {
      const c = canon(x.num);
      if (!c) return;
      if (!dedup.find((y)=> canon(y.num) === c)) dedup.push(x);
    });

    // Strategy: Identify Work Phone first. If a number is Work Phone, it CANNOT be Mobile or Other.
    // 1. Find Work/HQ/Corporate Phone
    let workHqObj = dedup.find((x)=> ["work_hq", "work_phone", "hq", "office", "corporate", "company"].includes(x.type) || isLikelyCorporatePhoneNumber(x.num));
    let workHqNum = workHqObj ? workHqObj.num : "";
    let workHqCanon = canon(workHqNum);

    let mobileObj = dedup.find((x)=>
      canon(x.num) !== workHqCanon &&
      !["work_hq", "work_phone", "hq", "office", "corporate", "company"].includes(x.type) &&
      x.type === "mobile" &&
      !isLikelyCorporatePhoneNumber(x.num)
    );
    let mobileNum = mobileObj ? mobileObj.num : "";
    let mobileCanon = canon(mobileNum);

    if (!mobileNum) {
        const fallback = dedup.find(x =>
          canon(x.num) !== workHqCanon &&
          !["work_hq", "work_phone", "hq", "office", "corporate", "company"].includes(x.type) &&
          isLikelyMobilePhoneNumber(x.num) &&
          !isLikelyCorporatePhoneNumber(x.num)
        );
        if (fallback) {
            mobileNum = fallback.num;
            mobileCanon = canon(mobileNum);
        }
    }

    // Safety: Ensure Mobile is not same as Work (Redundant but safe)
    if (mobileCanon === workHqCanon && workHqCanon !== "") {
        mobileNum = "";
        mobileCanon = "";
    }

    // 4. Collect "Others" (Second Phone, Other Numbers)
    // Rule: Exclude numbers that are already identified as Mobile or Work HQ.
    const othersList = dedup
        .filter((x) => {
            const c = canon(x.num);
            return c !== mobileCanon && c !== workHqCanon;
        })
        .map((x) => x.num);

    return { mobile: phonePretty(mobileNum), workHq: phonePretty(workHqNum), others: othersList.map(phonePretty) };
  };

const splitName = (name) => {
  if (!name) return { first: "", last: "" };
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.shift(), last: parts.join(" ") };
};

const locationParts = (loc) => {
  if (!loc) return { city: "", state: "", country: "" };
  const parts = String(loc).split(",").map((s)=> s.trim()).filter(Boolean);
  const country = parts.pop() || "";
  const state = parts.pop() || "";
  const city = parts.join(", ") || "";
  return { city, state, country };
};


export const mapItemToOrgRow = (item) => {
  return getOrgRowArray(item).map(q).join(",");
};

export const prepareCompaniesData = (items) => {
  const finalHeaders = [...companiesHeaders];
  const rows = items.map(it => getCompaniesRowArray(it));
  return { headers: finalHeaders, rows };
};

export const prepareOrgData = (items) => {
  const maxOthers = Math.max(
    0,
    ...items.map((it)=> {
      const raw = it?.raw || {};
      const { others } = pickPhones(raw);
      // others[0] is Second Phone, others[1] is Other Numbers 1
      // So we need extras for others[2] onwards.
      return Math.max(0, others.length - 2);
    })
  );
  const base = [...orgHeaders];
  const idx = base.indexOf("Other Numbers 1");
  const extras = [];
  for (let i = 2; i <= maxOthers + 1; i++) extras.push(`Other Numbers ${i}`);
  const finalHeaders = idx >= 0 ? [...base.slice(0, idx + 1), ...extras, ...base.slice(idx + 1)] : base;
  
  const rows = items.map((it)=> {
    const raw = it?.raw || {};
    const rowVals = getOrgRowArray(it);
    const { others } = pickPhones(raw);
    // Insert starting from others[2]
    const insert = others.slice(2).map((n)=> n);
    // Pad with empty strings if this row has fewer others than max
    while (insert.length < extras.length) insert.push("");
    
    const pos = idx + 1; // "Other Numbers 1" is at idx, so we insert after it (at idx + 1)
    // Wait, "Other Numbers 1" is in the base array.
    // The base array has: [..., "Second Phone", "Other Numbers 1", "Corporate Phone", ...]
    // In getOrgRowArray, the values are: [..., mobile, others[0], others[1], workHq, ...]
    // others[0] corresponds to "Second Phone".
    // others[1] corresponds to "Other Numbers 1".
    // So "Other Numbers 1" is at index `idx` in headers.
    // Its value is at `idx` in rowVals (assuming 1-to-1 mapping).
    // Let's verify the index.
    
    // orgHeaders:
    // 16: Mobile Phone
    // 17: Second Phone
    // 18: Other Numbers 1
    // 19: Corporate Phone
    
    // rowVals:
    // 15: mobile
    // 16: others[0] (Second Phone)
    // 17: others[1] (Other Numbers 1)
    // 18: workHq (Corporate Phone)
    
    // Wait, orgHeaders has 43 items.
    // rowVals has... let's count.
    // 0: first
    // 1: last
    // ...
    // 14: departments
    // 15: mobile
    // 16: others[0]
    // 17: others[1]
    // 18: workHq
    
    // orgHeaders[18] is "Other Numbers 1".
    // rowVals[17] is others[1].
    // Wait, let's align them.
    // orgHeaders indices:
    // 0: First Name ... 14: Headline? No.
    // Let's check orgHeaders again.
    // 0: First Name
    // 1: Last Name
    // 2: Job Title
    // 3: Company
    // 4: Business Email 1
    // 5: BE1 Status
    // 6: BE2
    // 7: BE2 Status
    // 8: PE1
    // 9: PE1 Status
    // 10: PE2
    // 11: PE2 Status
    // 12: Headline
    // 13: Seniority
    // 14: Departments
    // 15: Mobile Phone  <-- rowVals[15] (mobile)
    // 16: Second Phone  <-- rowVals[16] (others[0])
    // 17: Other Numbers 1 <-- rowVals[17] (others[1])
    // 18: Corporate Phone <-- rowVals[18] (workHq)
    
    // So "Other Numbers 1" is at index 17 in orgHeaders?
    // In the file:
    // 17→  "Mobile Phone",
    // 18→  "Second Phone",
    // 19→  "Other Numbers 1",
    // 20→  "Corporate Phone",
    
    // But lines 1-43 show:
    // 15→  "Seniority",
    // 16→  "Departments",
    // 17→  "Mobile Phone",
    // 18→  "Second Phone",
    // 19→  "Other Numbers 1",
    
    // Array index is 0-based.
    // 0: First Name
    // ...
    // 14: Seniority
    // 15: Departments
    // 16: Mobile Phone
    // 17: Second Phone
    // 18: Other Numbers 1
    
    // rowVals:
    // 13: seniority
    // 14: departments
    // 15: mobile
    // 16: others[0]
    // 17: others[1]
    
    // So yes, `idx` for "Other Numbers 1" is 18 in orgHeaders.
    // And in rowVals, it corresponds to index 17?
    // Wait.
    // rowVals construction:
    // 0: first
    // 1: last
    // 2: title
    // 3: company
    // 4: be1
    // 5: be1s
    // 6: be2
    // 7: be2s
    // 8: pe1
    // 9: pe1s
    // 10: pe2
    // 11: pe2s
    // 12: headline
    // 13: seniority
    // 14: departments
    // 15: mobile
    // 16: others[0]
    // 17: others[1]
    
    // orgHeaders construction:
    // 0: First Name
    // 1: Last Name
    // 2: Job Title
    // 3: Company
    // 4: Business Email 1
    // 5: Business Email 1 Status
    // 6: Business Email 2
    // 7: Business Email 2 Status
    // 8: Personal Email 1
    // 9: Personal Email 1 Status
    // 10: Personal Email 2
    // 11: Personal Email 2 Status
    // 12: Headline
    // 13: Seniority
    // 14: Departments
    // 15: Mobile Phone (line 17 in file, but 0-indexed is 16? No line 2 is index 0)
    // Line 2: "First Name" -> index 0
    // Line 17: "Mobile Phone" -> index 15? (17-2=15). Yes.
    // Line 18: "Second Phone" -> index 16.
    // Line 19: "Other Numbers 1" -> index 17.
    
    // So `idx` for "Other Numbers 1" is 17.
    // In rowVals, others[1] is at index 17.
    // So we want to insert AFTER "Other Numbers 1".
    // So we insert at `idx + 1` (index 18).
    
    const enriched = idx >= 0 ? [...rowVals.slice(0, idx + 1), ...insert, ...rowVals.slice(idx + 1)] : rowVals;
    return enriched;
  });
  
  return { headers: finalHeaders, rows };
};

export const buildOrgCsv = (items, isCompaniesList = false) => {
  // If it's a companies list, we strictly use the companies headers format.
  // We can still append extra columns if needed, but we bypass the originalHeaders logic 
  // because the user wants a specific companies export format.
  if (isCompaniesList) {
    const { headers: preparedHeaders, rows: preparedRows } = prepareCompaniesData(items);
    
    const extraColumns = new Set();
    const internalKeys = [
      'contact__emails', 'contact__phone_numbers', 'current_positions', 'organization', 
      'headers', 'original', 'queryId', 'listId', 'audit__source', '__v', '_id', 'status', 'createdAt', 'updatedAt',
      '__headers', '__original'
    ];
    
    const mappedKeys = new Set([
      'company', 'name', 'company_name', 'industry', 'organization__industry', 'organization__industries',
      'country', 'company_country', 'location_country', 'location',
      'headcount', 'company_headcount', 'employees',
      'revenue_min', 'revenue_max', 'annual_revenue', 'organization__annual_revenue',
      'founded_at', 'founded_year', 'organization__founded_year',
      'keywords', 'organization__keywords', 'skills', 'overview',
      'website', 'organization__website',
      'company_linkedin_url', 'organization__linkedin_url'
    ]);

    items.forEach(it => {
       Object.keys(it.raw || {}).forEach(k => {
           if (internalKeys.includes(k)) return;
           if (mappedKeys.has(k)) return; 
           extraColumns.add(k);
       });
    });
    
    const extraColsArray = Array.from(extraColumns).sort();
    const fullHeaders = [...preparedHeaders, ...extraColsArray];
    
    const fullRows = preparedRows.map((row, i) => {
        const item = items[i];
        const raw = item?.raw || {};
        const extraVals = extraColsArray.map(col => {
            let val = raw[col];
            if (val === null || val === undefined) return "";
            if (typeof val === 'object') {
              try { return JSON.stringify(val); } catch { return "[Object]"; }
            }
            return String(val);
        });
        return [...row, ...extraVals];
    });
    
    const qLocal = (v) => {
      const s = v == null ? "" : String(v);
      const t = s.replace(/\r?\n/g, " ").replace(/"/g, '""');
      return `"${t}"`;
    };

    const headerLine = fullHeaders.map(qLocal).join(",");
    const lines = fullRows.map(row => row.map(qLocal).join(","));
    const csv = [headerLine, ...lines].join("\r\n");
    return new Blob([csv], { type: "text/csv;charset=utf-8;" });
  }

  // Check if we have original headers stored (from new upload logic)
  let originalHeaders = [];
  const firstWithHeaders = items.find(it => it?.raw?.__headers && Array.isArray(it.raw.__headers));
  if (firstWithHeaders) {
    originalHeaders = [...firstWithHeaders.raw.__headers];
  } else {
     // Fallback: check if __original exists on items and derive headers
     const firstWithOriginal = items.find(it => it?.raw?.__original);
     if (firstWithOriginal) {
         originalHeaders = Object.keys(firstWithOriginal.raw.__original);
     }
  }

  // If we found original headers, use them as the base!
  // This ensures the export matches the upload exactly.
  // We will still append *new* enriched columns.
  
  if (originalHeaders.length > 0) {
      const extraColumns = new Set();
      const internalKeys = [
        'contact__emails', 'contact__phone_numbers', 'current_positions', 'organization', 
        'headers', 'original', 'queryId', 'listId', 'audit__source', '__v', '_id', 'listId', 'status', 'createdAt', 'updatedAt',
        '__headers', '__original'
      ];
      
      // We don't need mappedKeys exclusion here because we are starting with the ORIGINAL keys.
      // We just need to find keys in `raw` that are NOT in `originalHeaders`.
      // Note: `raw` has normalized keys (e.g. `first_name`), while `originalHeaders` has `First Name`.
      // Enrichment usually adds keys like `contact__email`, `linkedin_url` (if not present), etc.
      // Or `raw` keys that were added by the backend but don't map to an original header?
      
      // Wait. `raw` contains:
      // 1. `first_name` (mapped from `First Name`)
      // 2. `__original` { `First Name`: ... }
      
      // If we export `First Name` from `__original`, we don't want to export `first_name` from `raw` as an extra column.
      // So we need to ignore keys in `raw` that were *derived* from original headers.
      // The `COLUMN_MAPPING` in backend maps `First Name` -> `first_name`.
      // We don't have that mapping here easily.
      
      // Heuristic: If we are using `originalHeaders`, we should IGNORE most of the standard `raw` keys 
      // because they are just normalized versions.
      // We only want *truly* new keys (enrichment).
      
      // Let's use a strict allowlist for "Extra" columns, OR a blocklist for standard keys.
      // The blocklist I used before (`mappedKeys`) is actually perfect for this!
      // It lists all the standard normalized keys (`first_name`, `company`, etc.).
      // If a key in `raw` is in `mappedKeys`, we assume it's a normalized version of an original column 
      // (or a standard field we don't want to duplicate if we have original).
      
      const mappedKeys = new Set([
         'first_name', 'last_name', 'name', 'title', 'role', 'company', 
         'email', 'email_status', 'email_2', 'email_2_status', 
         'personal_email', 'personal_email_status', 'personal_email_2', 'personal_email_2_status',
         'headline', 'seniority', 'departments', 'department', 'function',
         'phone', 'mobile_phone', 'second_phone', 'other_phone', 'corporate_phone',
         'company_headcount', 'employees', 'industry', 'keywords',
         'public_profile_url', 'linkedin_url', 'website',
         'company_linkedin_url', 'facebook_url', 'twitter_url',
         'location', 'company_address', 'company_city', 'company_state', 'company_country',
         'technologies', 'founded_year', 'annual_revenue', 'total_funding',
         'latest_funding', 'latest_funding_amount', 'last_raised_at',
         'business_email_1', 'business_email_1_status', 'business_email_2', 'business_email_2_status',
         'personal_email_1', 'personal_email_1_status',
         'organization__industry', 'organization__industries', 'organization__technologies',
         'organization__founded_year', 'organization__annual_revenue', 'organization__total_funding',
         'organization__latest_funding', 'organization__latest_funding_amount', 'organization__last_raised_at',
         'organization__linkedin_url', 'organization__facebook_url', 'organization__twitter_url',
         'organization__website', 'organization__address', 'organization__city', 'organization__state', 'organization__country'
      ]);

      items.forEach(it => {
         Object.keys(it.raw || {}).forEach(k => {
             if (internalKeys.includes(k)) return;
             if (mappedKeys.has(k)) return; 
             extraColumns.add(k);
         });
      });
      
      const extraColsArray = Array.from(extraColumns).sort();
      const fullHeaders = [...originalHeaders, ...extraColsArray];

      const fullRows = items.map(item => {
          const raw = item?.raw || {};
          const orig = raw.__original || {};
          
          // Get values for original headers
          const origVals = originalHeaders.map(h => {
             // Try to get from __original first
             if (orig[h] !== undefined) return orig[h];
             // Fallback to raw? No, if it's in originalHeaders it should be in __original.
             return "";
          });
          
          // Get values for extra columns
          const extraVals = extraColsArray.map(col => {
              let val = raw[col];
              if (val === null || val === undefined) return "";
              if (typeof val === 'object') {
                try { return JSON.stringify(val); } catch { return "[Object]"; }
              }
              return String(val);
          });
          
          return [...origVals, ...extraVals];
      });
      
      const qLocal = (v) => {
        const s = v == null ? "" : String(v);
        const t = s.replace(/\r?\n/g, " ").replace(/"/g, '""');
        return `"${t}"`;
      };

      const headerLine = fullHeaders.map(qLocal).join(",");
      const lines = fullRows.map(row => row.map(qLocal).join(","));
      const csv = [headerLine, ...lines].join("\r\n");
      return new Blob([csv], { type: "text/csv;charset=utf-8;" });
  }

  // FALLBACK TO OLD LOGIC (for existing lists without __original)
  const { headers: preparedHeaders, rows: preparedRows } = prepareOrgData(items);
  
  // Collect all unique keys from raw data that aren't already covered or internal
  const extraColumns = new Set();
  const internalKeys = [
    'contact__emails', 'contact__phone_numbers', 'current_positions', 'organization', 
    'headers', 'original', 'queryId', 'listId', 'audit__source', '__v', '_id', 'listId', 'status', 'createdAt', 'updatedAt',
    '__headers', '__original'
  ];
  
  const mappedKeys = new Set([
      'first_name', 'last_name', 'name', 'title', 'role', 'company', 
      'email', 'email_status', 'email_2', 'email_2_status', 
      'personal_email', 'personal_email_status', 'personal_email_2', 'personal_email_2_status',
      'headline', 'seniority', 'departments', 'department', 'function',
      'phone', 'mobile_phone', 'second_phone', 'other_phone', 'corporate_phone',
      'company_headcount', 'employees', 'industry', 'keywords',
      'public_profile_url', 'linkedin_url', 'website',
      'company_linkedin_url', 'facebook_url', 'twitter_url',
      'location', 'company_address', 'company_city', 'company_state', 'company_country',
      'technologies', 'founded_year', 'annual_revenue', 'total_funding',
      'latest_funding', 'latest_funding_amount', 'last_raised_at',
      'business_email_1', 'business_email_1_status', 'business_email_2', 'business_email_2_status',
      'personal_email_1', 'personal_email_1_status',
      'organization__industry', 'organization__industries', 'organization__technologies',
      'organization__founded_year', 'organization__annual_revenue', 'organization__total_funding',
      'organization__latest_funding', 'organization__latest_funding_amount', 'organization__last_raised_at',
      'organization__linkedin_url', 'organization__facebook_url', 'organization__twitter_url',
      'organization__website', 'organization__address', 'organization__city', 'organization__state', 'organization__country'
  ]);

  items.forEach(it => {
     Object.keys(it.raw || {}).forEach(k => {
         if (internalKeys.includes(k)) return;
         if (mappedKeys.has(k)) return; 
         extraColumns.add(k);
     });
  });
  
  const extraColsArray = Array.from(extraColumns).sort();
  
  // Merge headers
  const fullHeaders = [...preparedHeaders, ...extraColsArray];
  
  const fullRows = preparedRows.map((row, i) => {
      const item = items[i];
      const raw = item?.raw || {};
      const extraVals = extraColsArray.map(col => {
          let val = raw[col];
          if (val === null || val === undefined) return "";
          if (typeof val === 'object') {
            try {
              return JSON.stringify(val);
            } catch {
              return "[Object]";
            }
          }
          return String(val);
      });
      return [...row, ...extraVals];
  });
  
  const qLocal = (v) => {
    const s = v == null ? "" : String(v);
    const t = s.replace(/\r?\n/g, " ").replace(/"/g, '""');
    return `"${t}"`;
  };

  const headerLine = fullHeaders.map(qLocal).join(",");
  const lines = fullRows.map(row => row.map(qLocal).join(","));
  const csv = [headerLine, ...lines].join("\r\n");
  return new Blob([csv], { type: "text/csv;charset=utf-8;" });
};

export const getCompaniesRowArray = (item) => {
  const raw = item?.raw || {};
  
  const getArrayStr = (val) => Array.isArray(val) ? val.join('; ') : (val || "");

  const company = raw.__original?.['Company Name'] || raw.__original?.['Company'] || item.company || raw.company || item.name || raw.name || raw.company_name || "";
  
  let employees = "";
  if (raw.__original?.['# Employees']) employees = raw.__original['# Employees'];
  else {
    const pos0 = Array.isArray(raw.current_positions) ? raw.current_positions[0] : null;
    if (pos0 && pos0.linkedin_employee_count) employees = pos0.linkedin_employee_count;
    else if (pos0 && pos0.employee_count) employees = pos0.employee_count;
    else if (raw.headcount) employees = raw.headcount;
    else if (raw.company_headcount) employees = raw.company_headcount;
    else if (raw.employees) employees = raw.employees;
    else if (raw['# Employees']) employees = raw['# Employees'];
    else if (Array.isArray(raw.current_employee_count)) employees = raw.current_employee_count.join("-");
    else if (raw.current_employee_count) employees = raw.current_employee_count;
    else if (Array.isArray(raw.employee_count)) employees = raw.employee_count.join("-");
    else if (raw.employee_count) employees = raw.employee_count;
  }

  let ind = raw.__original?.['Industry'] || item.industry || raw.industry;
  if (!ind || (Array.isArray(ind) && ind.length === 0)) ind = item.organization__industry || raw.organization__industry;
  if (!ind || (Array.isArray(ind) && ind.length === 0)) ind = item.organization__industries || raw.organization__industries;
  const industry = Array.isArray(ind) ? ind.join("; ") : (ind || "");

  let website = raw.__original?.['Website'] || item.website || raw.website || item.organization__website || raw.organization__website || raw.domain || raw.company_domain || raw.organization__website_url || raw.organization_website || "";
  if (!website && raw.logo && typeof raw.logo === 'string' && raw.logo.includes('key=')) {
      try {
          const base64 = raw.logo.split('key=')[1].split('&')[0];
          const decoded = Buffer.from(base64, 'base64').toString('utf-8');
          if (decoded.includes('logo.clearbit.com/')) {
              website = decoded.split('logo.clearbit.com/')[1].split('?')[0].split('/')[0];
          }
      } catch(e) {}
  }

  let companyLinkedin = raw.__original?.['Company Linkedin Url'] || raw.__original?.['LinkedIn URL'] || item.company_linkedin_url || raw.company_linkedin_url || item.organization__linkedin_url || raw.organization__linkedin_url || raw.linkedin_url || "";
  if (!companyLinkedin && Array.isArray(raw.experience) && raw.experience.length > 0) {
      const currentCompany = raw.current_positions?.[0]?.company || raw.company || "";
      if (currentCompany) {
          const exp = raw.experience.find(e => e.company?.name && e.company.name.toLowerCase().includes(currentCompany.toLowerCase()));
          if (exp && exp.company?.url) {
              companyLinkedin = exp.company.url;
          }
      }
  }

  const facebook_url = raw.__original?.['Facebook Url'] || raw.__original?.['Facebook URL'] || raw.facebook_url || raw.organization__facebook_url || "";
  const twitter_url = raw.__original?.['Twitter Url'] || raw.__original?.['Twitter URL'] || raw.twitter_url || raw.organization__twitter_url || "";
  
  const company_street = raw.__original?.['Company Street'] || raw.company_street || raw.organization__street || "";
  const company_city = raw.__original?.['Company City'] || raw.__original?.['City'] || raw.organization__city || raw.city || raw.company_city || raw.contact__city || raw.location_city || (raw.location || "").split(",")[0]?.trim() || "";
  const company_state = raw.__original?.['Company State'] || raw.__original?.['State'] || raw.company_state || raw.organization__state || raw.state || "";
  const company_country = raw.__original?.['Company Country'] || raw.__original?.['Country'] || raw.organization__country || raw.country || raw.company_country || raw.contact__country || raw.location_country || (raw.location || "").split(",")[2]?.trim() || "";
  const company_postal_code = raw.__original?.['Company Postal Code'] || raw.__original?.['Postal Code'] || raw.company_postal_code || raw.organization__postal_code || raw.postal_code || "";
  const company_address = raw.__original?.['Company Address'] || raw.__original?.['Address'] || getArrayStr(raw.organization__address || raw.address || raw.company_address || raw.organization__raw_address || raw.contact__address);

  let kw = raw.__original?.['Keywords'] || raw.keywords;
  if (!kw || (Array.isArray(kw) && kw.length === 0)) kw = raw.organization__keywords;
  if (!kw || (Array.isArray(kw) && kw.length === 0)) kw = raw.skills;
  if (!kw || (Array.isArray(kw) && kw.length === 0)) kw = raw.overview;
  const keywords = Array.isArray(kw) ? kw.join("; ") : (kw || "");

  const company_phone = raw.__original?.['Company Phone'] || raw.company_phone || raw.organization__phone || raw.phone || "";

  let technologies = raw.__original?.['Technologies'];
  if (!technologies) {
      const orgTech = Array.isArray(raw.organization__technologies) && raw.organization__technologies.length > 0 ? raw.organization__technologies : null;
      const tech = Array.isArray(raw.technologies) && raw.technologies.length > 0 ? raw.technologies : null;
      const curTech = Array.isArray(raw.organization__current_technologies) && raw.organization__current_technologies.length > 0 ? raw.organization__current_technologies : null;
      technologies = getArrayStr(orgTech || tech || curTech || raw.organization__technologies || raw.technologies || raw.organization__current_technologies);
  }

  const total_funding = raw.__original?.['Total Funding'] || getArrayStr(raw.organization__total_funding || raw.total_funding);
  const latest_funding = raw.__original?.['Latest Funding'] || getArrayStr(raw.organization__latest_funding || raw.latest_funding);
  const latest_funding_amount = raw.__original?.['Latest Funding Amount'] || getArrayStr(raw.organization__latest_funding_amount || raw.latest_funding_amount);
  const last_raised_at = raw.__original?.['Last Raised At'] || getArrayStr(raw.organization__last_raised_at || raw.last_raised_at);

  let annualRevenue = "";
  if (raw.__original?.['Annual Revenue']) annualRevenue = raw.__original['Annual Revenue'];
  else if (raw.revenue_min || raw.revenue_max) {
    if (raw.revenue_min === raw.revenue_max) annualRevenue = `$${raw.revenue_min}`;
    else annualRevenue = `$${raw.revenue_min} - $${raw.revenue_max}`;
  } else {
    annualRevenue = raw.annual_revenue || raw.organization__annual_revenue || "";
  }
  
  const short_description = raw.__original?.['Short Description'] || raw.__original?.['Description'] || raw.short_description || raw.organization__short_description || raw.description || "";
  const foundedYear = raw.__original?.['Founded Year'] || raw.founded_at || raw.founded_year || raw.organization__founded_year || "";

  return [
    company,
    employees,
    industry,
    website,
    companyLinkedin,
    facebook_url,
    twitter_url,
    company_street,
    company_city,
    company_state,
    company_country,
    company_postal_code,
    company_address,
    keywords,
    company_phone,
    technologies,
    total_funding,
    latest_funding,
    latest_funding_amount,
    last_raised_at,
    annualRevenue,
    short_description,
    foundedYear
  ];
};

export const getOrgRowArray = (item) => {
  const raw = item?.raw || {};
  const pos = Array.isArray(raw.current_positions) ? raw.current_positions[0] || {} : {};
  const name = raw.name || item.name || "";
  let { first, last } = splitName(name);
  if (!first && raw.first_name) first = raw.first_name;
  if (!last && raw.last_name) last = raw.last_name;
  const title = pos.title || pos.role || item.title || raw.title || "";
  const company = pos.company || item.company || raw.company || "";
  const { biz, per } = pickEmails(raw);
  // Also check raw direct email fields if pickEmails missed them
  const be1 = biz[0]?.email || raw.email || raw.business_email_1 || "";
  const be1s = biz[0]?.status || raw.email_status || raw.business_email_1_status || "";
  const be2 = biz[1]?.email || raw.email_2 || raw.business_email_2 || "";
  const be2s = biz[1]?.status || raw.email_2_status || raw.business_email_2_status || "";
  const pe1 = per[0]?.email || raw.personal_email || raw.personal_email_1 || "";
  const pe1s = per[0]?.status || raw.personal_email_status || raw.personal_email_1_status || "";
  const pe2 = per[1]?.email || raw.personal_email_2 || "";
  const pe2s = per[1]?.status || raw.personal_email_2_status || "";
  const headline = raw.headline || (title && company ? `${title} at ${company}` : "");
  
  // Smart Seniority Extractor (prefer nested matched seniority, fallback to root)
  const seniority = pos.seniority || pos.mawsool_seniority || item.seniority || raw.seniority || deriveSeniority(title);
  const departments = raw.job_function || raw.function || raw.department || raw.departments || (Array.isArray(raw.current_positions) && raw.current_positions[0]?.function) || "";
  let { mobile, workHq, others } = pickPhones(raw);
  
  // Fallback Logic: Only apply if the specific slot is EMPTY.
  // And CRITICALLY: Check against existing numbers to prevent duplication.
  const allAssigned = [mobile, workHq, ...others].filter(Boolean).map(canon);

  if (!mobile && raw.phone) {
      const p = phonePretty(raw.phone);
      if (!allAssigned.includes(canon(p))) mobile = p;
  }
  if (!mobile && raw.mobile_phone) {
      const p = phonePretty(raw.mobile_phone);
      if (!allAssigned.includes(canon(p))) mobile = p;
  }
  if (!workHq && raw.corporate_phone) {
      const p = phonePretty(raw.corporate_phone);
      // If this corporate phone is already used as mobile, clear mobile to prioritize corporate
      if (canon(mobile) === canon(p)) {
          mobile = ""; 
          workHq = p;
      } else if (!allAssigned.includes(canon(p))) {
          workHq = p;
      }
  }
  
  // No loose fallback for others; pickPhones handles that well enough.
  const headcount = pos.employee_count || pos.headcount || raw.company_headcount || raw.employees || raw['# Employees'] || (Array.isArray(raw.current_employee_count) && raw.current_employee_count.length > 0 ? raw.current_employee_count.join("-") : raw.current_employee_count && !Array.isArray(raw.current_employee_count) ? raw.current_employee_count : null) || (Array.isArray(raw.employee_count) && raw.employee_count.length > 0 ? raw.employee_count.join("-") : raw.employee_count && !Array.isArray(raw.employee_count) ? raw.employee_count : null) || "";
  
  let ind = pos.industry;
  if (!ind || (Array.isArray(ind) && ind.length === 0)) ind = raw.organization__industry;
  if (!ind || (Array.isArray(ind) && ind.length === 0)) ind = raw.organization__industries;
  if (!ind || (Array.isArray(ind) && ind.length === 0)) ind = raw.industry;
  const industry = Array.isArray(ind) ? ind.join("; ") : (ind || "");

  let kw = raw.keywords;
  if (!kw || (Array.isArray(kw) && kw.length === 0)) kw = raw.organization__keywords;
  const keywords = Array.isArray(kw) ? kw.join("; ") : (kw || "");
  const personUrl = raw.public_profile_url || raw.linkedin_url || "";
  
  // Extract specific company info from the current_positions object directly first, then raw root fields
  const website = pos.website || item.organization__website || raw.organization__website || raw.website || raw.domain || raw.company_domain || "";
  const companyLinkedin = pos.linkedin_url || pos.company_linkedin_url || item.organization__linkedin_url || raw.organization__linkedin_url || raw.company_linkedin_url || "";
  const facebook = raw.organization__facebook_url || raw.facebook_url || "";
  const twitter = raw.organization__twitter_url || raw.twitter_url || "";
  
  // Refined Location Logic: Prioritize direct raw fields over parsing 'location' string
  // This ensures that if we have 'raw.city', we use it instead of trying to guess from 'San Francisco, CA, US'
  let city = raw.city || raw.contact__city || "";
  let state = raw.state || raw.contact__state || "";
  let country = raw.country || raw.contact__country || "";
  
  // If direct fields are missing, try to parse from composite location string
  if (!city && !state && !country && raw.location) {
      const parts = locationParts(raw.location);
      city = parts.city;
      state = parts.state;
      country = parts.country;
  }

  const companyAddress = raw.organization__address || raw.company_address || raw.address || "";
  const companyCity = raw.organization__city || raw.company_city || "";
  const companyState = raw.organization__state || raw.company_state || "";
  const companyCountry = raw.organization__country || raw.company_country || "";
  let techs = raw.organization__current_technologies;
  if (!techs || (Array.isArray(techs) && techs.length === 0)) techs = raw.organization__technologies;
  if (!techs || (Array.isArray(techs) && techs.length === 0)) techs = raw.technologies;
  const technologies = Array.isArray(techs) ? techs.join("; ") : (techs || "");
  const foundedYear = raw.organization__founded_year || raw.founded_year || "";
  const annualRevenue = raw.organization__annual_revenue || raw.annual_revenue || "";
  const totalFunding = raw.organization__total_funding || raw.total_funding || "";
  const latestFunding = raw.organization__latest_funding || raw.latest_funding || "";
  const latestFundingAmount = raw.organization__latest_funding_amount || raw.latest_funding_amount || "";
  const lastRaisedAt = raw.organization__last_raised_at || raw.last_raised_at || "";

  const row = [
    first,
    last,
    title,
    company,
    be1,
    be1s,
    be2,
    be2s,
    pe1,
    pe1s,
    pe2,
    pe2s,
    headline,
    seniority,
    departments,
    mobile,
    others[0] || "",
    others[1] || "",
    workHq,
    headcount,
    industry,
    keywords,
    personUrl,
    website,
    companyLinkedin,
    facebook,
    twitter,
    city,
    country,
    companyAddress,
    companyCity,
    companyCountry,
    technologies,
    foundedYear,
    annualRevenue,
    totalFunding,
    latestFunding,
    latestFundingAmount,
    lastRaisedAt,
  ];
  return row;
};

const deriveSeniority = (title) => {
  const t = String(title || "").toLowerCase();
  const cSuite = ["chief","ceo","cfo","coo","cto","cio","president","founder"];
  if (cSuite.some((k)=> t.includes(k))) return "c_suite";
  return "";
};
