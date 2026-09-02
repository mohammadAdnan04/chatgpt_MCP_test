// This file acts as the SINGLE SOURCE OF TRUTH for List Columns in the system.
// You have full control here. If you want to delete a column from the UI or Export, simply comment it out or delete it.
// If you want to rename a column, change its 'label'.

const {
  isLikelyCorporatePhone,
  isLikelyMobilePhone,
  originalCorporateKeys,
  shouldTreatAsCorporateNumber,
  normalizePhoneKey: billingNormalizePhoneKey
} = require('../utils/revealBilling');

const FREE = new Set(['gmail.com','yahoo.com','outlook.com','hotmail.com','live.com','icloud.com','protonmail.com','yandex.com','aol.com','gmx.com','mail.com','msn.com','qq.com']);

const pickEmails = (raw) => {
  const src = Array.isArray(raw.contact__all_emails) ? raw.contact__all_emails : (Array.isArray(raw.contact__emails) ? raw.contact__emails : []);
  let list = src.map(e => ({ email: e?.email || e?.sanitized_email || '', status: e?.verificationStatus || raw.email_status || '' })).filter(x => x.email && String(x.email).toLowerCase() !== 'not available' && String(x.email).toLowerCase() !== 'n/a');
  if (!list.length && typeof raw.email === 'string' && raw.email.trim()) {
    raw.email.split(/[;,]+/).map(s => s.trim()).filter(Boolean).forEach(em => list.push({ email: em, status: raw.email_status || '' }));
  }
  const business = [];
  const personal = [];
  list.forEach(x => {
    const m = x.email.split('@')[1] || '';
    if (FREE.has(m.toLowerCase())) personal.push(x); else business.push(x);
  });
  return { business, personal };
};

const parsePhones = (raw) => {
  const out = [];
  const arr = Array.isArray(raw.contact__phone_numbers) ? raw.contact__phone_numbers : [];
  arr.forEach(p => {
    const num = p?.sanitized_number || p?.raw_number;
    if (num && String(num).toLowerCase() !== 'not available' && String(num).toLowerCase() !== 'n/a') out.push({ number: num, type: p?.type || '' });
  });
  const collect = (s, defaultType = '') => {
    if (!s) return;
    String(s).split(',').map(v => v.trim()).filter(Boolean).forEach(v => {
      if (v.toLowerCase() === 'not available' || v.toLowerCase() === 'n/a') return;
      const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      const num = m ? m[1].trim() : v;
      const type = m ? m[2].trim() : defaultType;
      const key = billingNormalizePhoneKey(num);
      if (!key) return;
      const existing = out.find(x => billingNormalizePhoneKey(x.number) === key);
      if (existing) {
        if (!existing.type && type) existing.type = type;
        return;
      }
      out.push({ number: num, type });
    });
  };
  collect(raw.phone);
  collect(raw.second_phone);
  collect(raw.corporate_phone, 'corporate');
  return out;
};

const formatPhone = (p) => {
  if (!p || !p.number) return '';
  return p.type ? `${p.number} (${p.type})` : p.number;
};

const getPhoneType = (raw, typeString) => {
    const phones = parsePhones(raw);
    const corpType = (p) => /corporate|hq|office|work|landline|company/.test(String(p.type || '').toLowerCase());
    const mobiles = phones.filter((p) =>
      !corpType(p) &&
      (isLikelyMobilePhone(p.number) || String(p.type || '').toLowerCase().includes('mobile')) &&
      !shouldTreatAsCorporateNumber(p.number, raw) &&
      !isLikelyCorporatePhone(p.number)
    );
    const mobile = mobiles[0] || null;
    const second = mobiles[1] || null;
    const others = phones
      .filter((p) => p !== mobile && p !== second && !corpType(p) && !isLikelyCorporatePhone(p.number) && !shouldTreatAsCorporateNumber(p.number, raw))
      .map((p) => formatPhone(p))
      .join('; ');

    if (typeString === 'mobile') return formatPhone(mobile);
    if (typeString === 'second') return formatPhone(second);
    if (typeString === 'others') return others || '';
    return '';
}

const getArrayStr = (val) => Array.isArray(val) ? val.join('; ') : (val || "");

const parseLocationParts = (loc) => {
  const parts = String(loc || "").split(",").map(s => s.trim()).filter(Boolean);
  return {
    city: parts[0] || "",
    state: parts[1] || "",
    country: parts[2] || ""
  };
};

const pickEmailStatus = (raw) => {
  const list = pickEmails(raw);
  const s = list.business[0]?.status || list.personal[0]?.status || raw.contact__email_status || raw.email_status || "";
  return s || "";
};

const pickCorporatePhone = (raw) => {
  const phones = parsePhones(raw);
  const corp = phones.find(p => isLikelyCorporatePhone(p.number) || shouldTreatAsCorporateNumber(p.number, raw) || ['corporate','company','main','hq','switchboard','work','office'].some(h => String(p.type || "").toLowerCase().includes(h)));
  if (corp && corp.number) return corp.type ? `${corp.number} (${corp.type})` : corp.number;
  if (raw.corporate_phone) return String(raw.corporate_phone);
  return "";
};

const normalizePhoneKey = (v) => billingNormalizePhoneKey(v);

const aiSplitPhones = (raw) => {
  const phones = parsePhones(raw);
  const corporateHints = ['corporate','company','main','hq','switchboard','front desk','reception','work','office','landline'];
  const mobileHints = ['mobile','cell','direct_dial','direct','personal'];

  const byKey = new Map();
  phones.forEach(p => {
    const num = String(p?.number || "").trim();
    if (!num) return;
    const key = normalizePhoneKey(num);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, { number: num, type: String(p?.type || "").trim() });
  });

  const unique = Array.from(byKey.values());
  const corporateKeySet = originalCorporateKeys(raw || {});

  const isCorporate = (p) => {
    const t = String(p.type || "").toLowerCase();
    const key = normalizePhoneKey(p.number);
    if (key && corporateKeySet.has(key)) return true;
    if (corporateHints.some(h => t.includes(h))) return true;
    return isLikelyCorporatePhone(p.number) || shouldTreatAsCorporateNumber(p.number, raw);
  };
  const isMobileLike = (p) => {
    if (isCorporate(p)) return false;
    const t = String(p.type || "").toLowerCase();
    if (mobileHints.some(h => t.includes(h))) return true;
    return isLikelyMobilePhone(p.number);
  };

  let corporate = "";
  let mobile = "";
  let second = "";

  const remaining = [...unique];

  const corpIdx = remaining.findIndex(isCorporate);
  if (corpIdx >= 0) {
    corporate = remaining[corpIdx].number;
    remaining.splice(corpIdx, 1);
  }

  const mobileIdx = remaining.findIndex(isMobileLike);
  if (mobileIdx >= 0) {
    mobile = remaining[mobileIdx].number;
    remaining.splice(mobileIdx, 1);
  } else if (remaining.length > 0 && !isCorporate(remaining[0])) {
    mobile = remaining[0].number;
    remaining.splice(0, 1);
  } else if (remaining.length > 0 && !corporate) {
    corporate = remaining[0].number;
    remaining.splice(0, 1);
  }

  if (remaining.length > 0) {
    const nextMobile = remaining.find(isMobileLike);
    if (nextMobile) second = nextMobile.number;
    else if (!corporate && remaining[0] && isCorporate(remaining[0])) corporate = remaining[0].number;
  }

  const leftoverCorp = remaining.find(isCorporate);
  if (!corporate && leftoverCorp) corporate = leftoverCorp.number;

  const mKey = normalizePhoneKey(mobile);
  const sKey = normalizePhoneKey(second);
  const cKey = normalizePhoneKey(corporate);
  if (mKey && sKey && mKey === sKey) second = "";
  if (mKey && cKey && mKey === cKey) mobile = "";
  if (sKey && cKey && sKey === cKey) second = "";

  return { mobile, second, corporate };
};

const peopleColumns = [
  // --- Personal & Company Info ---
  { id: 'first_name', label: 'First Name', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['First Name'] || raw.first_name || (raw.name||"").split(" ")[0] || "" },
  { id: 'last_name', label: 'Last Name', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Last Name'] || raw.last_name || (raw.name||"").split(" ")?.slice(1).join(" ") || "" },
  { id: 'title', label: 'Job Title', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Job Title'] || raw.title || raw.current_positions?.[0]?.role || "" },
  { id: 'company', label: 'Company', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company'] || raw.company || raw.current_positions?.[0]?.company || "" },

  // --- UI-Specific Contact Data (Where Reveal Buttons Live) ---
  { id: 'email', label: 'Email', showInUI: true, showInExport: false, extract: (raw) => { const list = pickEmails(raw); return list.business[0]?.email || list.personal[0]?.email || raw.email || ""; } },
  { id: 'phone', label: 'Phone', showInUI: true, showInExport: false, extract: (raw) => aiSplitPhones(raw).mobile || "" },
  { id: 'corporate_phone', label: 'Corporate Phone', showInUI: true, showInExport: false, extract: (raw) => aiSplitPhones(raw).corporate || "" },

  // --- Export-Specific Contact Data (CSV Format) ---
  { id: 'business_email_1', label: 'Business Email 1', showInUI: false, showInExport: true, extract: (raw) => pickEmails(raw).business[0]?.email || "" },
  { id: 'business_email_1_status', label: 'Business Email 1 Status', showInUI: false, showInExport: true, extract: (raw) => pickEmails(raw).business[0]?.status || "" },
  { id: 'business_email_2', label: 'Business Email 2', showInUI: false, showInExport: true, extract: (raw) => pickEmails(raw).business[1]?.email || "" },
  { id: 'business_email_2_status', label: 'Business Email 2 Status', showInUI: false, showInExport: true, extract: (raw) => pickEmails(raw).business[1]?.status || "" },
  { id: 'personal_email_1', label: 'Personal Email 1', showInUI: false, showInExport: true, extract: (raw) => pickEmails(raw).personal[0]?.email || "" },
  { id: 'personal_email_1_status', label: 'Personal Email 1 Status', showInUI: false, showInExport: true, extract: (raw) => pickEmails(raw).personal[0]?.status || "" },
  { id: 'personal_email_2', label: 'Personal Email 2', showInUI: false, showInExport: true, extract: (raw) => pickEmails(raw).personal[1]?.email || "" },
  { id: 'personal_email_2_status', label: 'Personal Email 2 Status', showInUI: false, showInExport: true, extract: (raw) => pickEmails(raw).personal[1]?.status || "" },
  { id: 'mobile_phone', label: 'Mobile Phone', showInUI: false, showInExport: true, extract: (raw) => aiSplitPhones(raw).mobile || "" },
  { id: 'second_phone', label: 'Second Phone', showInUI: false, showInExport: true, extract: (raw) => aiSplitPhones(raw).second || "" },
  { id: 'other_numbers', label: 'Other Numbers 1', showInUI: false, showInExport: true, extract: (raw) => getPhoneType(raw, 'others') },
  { id: 'corporate_phone_export', label: 'Corporate Phone', showInUI: false, showInExport: true, extract: (raw) => aiSplitPhones(raw).corporate || "" },

  // --- Standard Data ---
  { id: 'linkedin_url', label: 'Person LinkedIn URL', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Person LinkedIn URL'] || raw.__original?.['Linkedin Url'] || raw.public_profile_url || raw.linkedin_url || raw.person_linkedin_url || "" },
  { id: 'headline', label: 'Headline', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Headline'] || raw.headline || ((raw.title&&raw.company)?`${raw.title} at ${raw.company}`:"") },
  { id: 'seniority', label: 'Seniority', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Seniority']) return raw.__original['Seniority'];
      if (raw.seniority) return raw.seniority;
      const t = String(raw.title || raw.current_positions?.[0]?.role || "").toLowerCase();
      const cSuite = ["chief","ceo","cfo","coo","cto","cio","president","founder"];
      return cSuite.some((k)=> t.includes(k)) ? "c_suite" : "";
  } },
  { id: 'departments', label: 'Departments', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Departments']) return raw.__original['Departments'];
      if (Array.isArray(raw.departments) && raw.departments.length > 0) return raw.departments.join("; ");
      if (raw.departments && !Array.isArray(raw.departments)) return String(raw.departments);
      if (raw.job_function) return raw.job_function;
      const pos0 = Array.isArray(raw.current_positions) ? raw.current_positions[0] : null;
      return (pos0 && pos0.function) || raw.function || raw.department || "";
  } },
  { id: 'employees', label: '# Employees', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['# Employees']) return raw.__original['# Employees'];
      
      const pos0 = Array.isArray(raw.current_positions) ? raw.current_positions[0] : null;
      if (pos0 && pos0.linkedin_employee_count) return pos0.linkedin_employee_count;
      if (pos0 && pos0.employee_count) return pos0.employee_count;

      if (raw.company_headcount) return raw.company_headcount;
      if (raw.employees) return raw.employees;
      if (raw['# Employees']) return raw['# Employees'];
      if (Array.isArray(raw.current_employee_count)) return raw.current_employee_count.join("-");
      if (raw.current_employee_count) return raw.current_employee_count;
      if (Array.isArray(raw.employee_count)) return raw.employee_count.join("-");
      if (raw.employee_count) return raw.employee_count;
      return "";
  } },
  { id: 'industry', label: 'Industry', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Industry']) return raw.__original['Industry'];
      if (Array.isArray(raw.organization__industry) && raw.organization__industry.length > 0) return raw.organization__industry.join("; ");
      if (Array.isArray(raw.organization__industries) && raw.organization__industries.length > 0) return raw.organization__industries.join("; ");
      if (raw.organization__industry && !Array.isArray(raw.organization__industry)) return raw.organization__industry;
      if (Array.isArray(raw.industry) && raw.industry.length > 0) return raw.industry.join("; ");
      if (raw.industry && !Array.isArray(raw.industry)) return raw.industry;
      if (raw['Industry']) return raw['Industry'];
      const pos0 = Array.isArray(raw.current_positions) ? raw.current_positions[0] : null;
      if (pos0 && Array.isArray(pos0.industry) && pos0.industry.length > 0) return pos0.industry.join("; ");
      if (pos0 && pos0.industry && !Array.isArray(pos0.industry)) return pos0.industry;
      return "";
  } },
  { id: 'keywords', label: 'Keywords', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Keywords'] || (Array.isArray(raw.keywords) ? raw.keywords.join("; ") : (raw.keywords || "")) },
  { id: 'website', label: 'Website', showInUI: true, showInExport: true, extract: (raw) => {
      let w = raw.__original?.['Website'] || raw.website || raw.organization__website || raw.domain || raw.company_domain || raw.organization__website_url || raw.organization_website || "";
      if (!w && raw.logo && typeof raw.logo === 'string' && raw.logo.includes('key=')) {
          try {
              const base64 = raw.logo.split('key=')[1].split('&')[0];
              const decoded = Buffer.from(base64, 'base64').toString('utf-8');
              if (decoded.includes('logo.clearbit.com/')) {
                  w = decoded.split('logo.clearbit.com/')[1].split('?')[0].split('/')[0];
              }
          } catch(e) {}
      }
      return w;
  } },
  { id: 'company_linkedin_url', label: 'Company Linkedin Url', showInUI: true, showInExport: true, extract: (raw) => {
      let url = raw.__original?.['Company Linkedin Url'] || raw.company_linkedin_url || raw.organization__linkedin_url || "";
      if (!url && Array.isArray(raw.experience) && raw.experience.length > 0) {
          const currentCompany = raw.current_positions?.[0]?.company || raw.company || "";
          if (currentCompany) {
              const exp = raw.experience.find(e => e.company?.name && e.company.name.toLowerCase().includes(currentCompany.toLowerCase()));
              if (exp && exp.company?.url) {
                  url = exp.company.url;
              }
          }
      }
      return url;
  } },
  { id: 'facebook_url', label: 'Facebook Url', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Facebook Url'] || raw.facebook_url || raw.organization__facebook_url || "" },
  { id: 'twitter_url', label: 'Twitter Url', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Twitter Url'] || raw.twitter_url || raw.organization__twitter_url || "" },
  
  // --- Location ---
  { id: 'city', label: 'City', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['City'] || raw.city || raw.contact__city || raw.location_city || (raw.location || "").split(",")[0]?.trim() || "" },
  { id: 'country', label: 'Country', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Country'] || raw.country || raw.contact__country || raw.location_country || (raw.location || "").split(",")[2]?.trim() || "" },
  { id: 'company_address', label: 'Company Address', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Address'] || getArrayStr(raw.organization__address || raw.address || raw.company_address || raw.organization__raw_address || raw.contact__address) },
  { id: 'company_city', label: 'Company City', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company City'] || getArrayStr(raw.organization__city || raw.company_city || raw.contact__city || raw.location_city) },
  { id: 'company_country', label: 'Company Country', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Country'] || getArrayStr(raw.organization__country || raw.company_country || raw.contact__country || raw.location_country) },
  
  // --- Deep Company Data ---
  { id: 'technologies', label: 'Technologies', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Technologies']) return raw.__original['Technologies'];
      const orgTech = Array.isArray(raw.organization__technologies) && raw.organization__technologies.length > 0 ? raw.organization__technologies : null;
      const tech = Array.isArray(raw.technologies) && raw.technologies.length > 0 ? raw.technologies : null;
      const curTech = Array.isArray(raw.organization__current_technologies) && raw.organization__current_technologies.length > 0 ? raw.organization__current_technologies : null;
      return getArrayStr(orgTech || tech || curTech || raw.organization__technologies || raw.technologies || raw.organization__current_technologies);
  } },
  { id: 'founded_year', label: 'Founded Year', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Founded Year'] || raw.organization__founded_year || raw.founded_year || raw.founded_at || "" },
  { id: 'annual_revenue', label: 'Annual Revenue', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Annual Revenue']) return raw.__original['Annual Revenue'];
      let rev = raw.organization__annual_revenue || raw.annual_revenue;
      if (typeof rev === 'number') {
          if (rev >= 1000000000) return (rev / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
          if (rev >= 1000000) return (rev / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
          if (rev >= 1000) return (rev / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
          return rev.toString();
      }
      return rev || "";
  } },
  { id: 'total_funding', label: 'Total Funding', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Total Funding'] || getArrayStr(raw.organization__total_funding || raw.total_funding) },
  { id: 'latest_funding', label: 'Latest Funding', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Latest Funding'] || getArrayStr(raw.organization__latest_funding || raw.latest_funding) },
  { id: 'latest_funding_amount', label: 'Latest Funding Amount', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Latest Funding Amount'] || getArrayStr(raw.organization__latest_funding_amount || raw.latest_funding_amount) },
  { id: 'last_raised_at', label: 'Last Raised At', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Last Raised At'] || getArrayStr(raw.organization__last_raised_at || raw.last_raised_at) }
];

const peopleColumnsById = Object.fromEntries(peopleColumns.map(c => [c.id, c]));

const aiPeopleColumns = [
  { id: 'first_name', label: 'First Name', showInUI: true, showInExport: true, extract: peopleColumnsById.first_name.extract },
  { id: 'last_name', label: 'Last Name', showInUI: true, showInExport: true, extract: peopleColumnsById.last_name.extract },
  { id: 'title', label: 'Title', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Title'] || raw.title || raw.current_positions?.[0]?.role || "" },
  { id: 'company', label: 'Company Name', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Name'] || raw.company || raw.current_positions?.[0]?.company || raw.organization_name || "" },
  { id: 'email', label: 'Email', showInUI: true, showInExport: true, extract: (raw) => { const list = pickEmails(raw); return list.business[0]?.email || list.personal[0]?.email || raw.email || raw.contact__email || ""; } },
  { id: 'email_status', label: 'Email Status', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Email Status'] || pickEmailStatus(raw) },
  { id: 'seniority', label: 'Seniority', showInUI: true, showInExport: true, extract: peopleColumnsById.seniority.extract },
  { id: 'departments', label: 'Departments', showInUI: true, showInExport: true, extract: peopleColumnsById.departments.extract },
  { id: 'mobile_phone', label: 'Mobile Phone', showInUI: true, showInExport: true, extract: (raw) => aiSplitPhones(raw).mobile || "" },
  { id: 'second_phone', label: 'Second Phone', showInUI: true, showInExport: true, extract: (raw) => aiSplitPhones(raw).second || "" },
  { id: 'corporate_phone', label: 'Corporate Phone', showInUI: true, showInExport: true, extract: (raw) => aiSplitPhones(raw).corporate || "" },
  { id: 'employees', label: '# Employees', showInUI: true, showInExport: true, extract: peopleColumnsById.employees.extract },
  { id: 'industry', label: 'Industry', showInUI: true, showInExport: true, extract: peopleColumnsById.industry.extract },
  { id: 'keywords', label: 'Keywords', showInUI: true, showInExport: true, extract: peopleColumnsById.keywords.extract },
  { id: 'linkedin_url', label: 'Person Linkedin Url', showInUI: true, showInExport: true, extract: peopleColumnsById.linkedin_url.extract },
  { id: 'website', label: 'Website', showInUI: true, showInExport: true, extract: peopleColumnsById.website.extract },
  { id: 'company_linkedin_url', label: 'Company Linkedin Url', showInUI: true, showInExport: true, extract: peopleColumnsById.company_linkedin_url.extract },
  { id: 'facebook_url', label: 'Facebook Url', showInUI: true, showInExport: true, extract: peopleColumnsById.facebook_url.extract },
  { id: 'twitter_url', label: 'Twitter Url', showInUI: true, showInExport: true, extract: peopleColumnsById.twitter_url.extract },
  { id: 'city', label: 'City', showInUI: true, showInExport: true, extract: peopleColumnsById.city.extract },
  { id: 'state', label: 'State', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['State'] || raw.state || raw.contact__state || raw.location_state || parseLocationParts(raw.location).state || "" },
  { id: 'country', label: 'Country', showInUI: true, showInExport: true, extract: peopleColumnsById.country.extract },
  { id: 'company_address', label: 'Company Address', showInUI: true, showInExport: true, extract: peopleColumnsById.company_address.extract },
  { id: 'company_city', label: 'Company City', showInUI: true, showInExport: true, extract: peopleColumnsById.company_city.extract },
  { id: 'company_state', label: 'Company State', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company State'] || raw.company_state || raw.organization__state || raw.organization_state || "" },
  { id: 'company_country', label: 'Company Country', showInUI: true, showInExport: true, extract: peopleColumnsById.company_country.extract },
  { id: 'technologies', label: 'Technologies', showInUI: true, showInExport: true, extract: peopleColumnsById.technologies.extract },
  { id: 'annual_revenue', label: 'Annual Revenue', showInUI: true, showInExport: true, extract: peopleColumnsById.annual_revenue.extract },
  { id: 'total_funding', label: 'Total Funding', showInUI: true, showInExport: true, extract: peopleColumnsById.total_funding.extract },
  { id: 'latest_funding', label: 'Latest Funding', showInUI: true, showInExport: true, extract: peopleColumnsById.latest_funding.extract },
  { id: 'latest_funding_amount', label: 'Latest Funding Amount', showInUI: true, showInExport: true, extract: peopleColumnsById.latest_funding_amount.extract },
  { id: 'last_raised_at', label: 'Last Raised At', showInUI: true, showInExport: true, extract: peopleColumnsById.last_raised_at.extract }
];

const companyColumns = [
  { id: 'company', label: 'Company Name', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Name'] || raw.__original?.['Company'] || raw.company || raw.name || raw.company_name || "" },
  { id: 'employees', label: '# Employees', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['# Employees']) return raw.__original['# Employees'];
      
      const pos0 = Array.isArray(raw.current_positions) ? raw.current_positions[0] : null;
      if (pos0 && pos0.linkedin_employee_count) return pos0.linkedin_employee_count;
      if (pos0 && pos0.employee_count) return pos0.employee_count;

      if (raw.headcount) return raw.headcount;
      if (raw.company_headcount) return raw.company_headcount;
      if (raw.employees) return raw.employees;
      if (raw['# Employees']) return raw['# Employees'];
      if (Array.isArray(raw.current_employee_count)) return raw.current_employee_count.join("-");
      if (raw.current_employee_count) return raw.current_employee_count;
      if (Array.isArray(raw.employee_count)) return raw.employee_count.join("-");
      if (raw.employee_count) return raw.employee_count;
      return "";
  } },
  { id: 'industry', label: 'Industry', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Industry']) return raw.__original['Industry'];
      let ind = raw.industry;
      if (Array.isArray(ind) && ind.length === 0) ind = null;
      if (!ind) ind = raw.organization__industry;
      if (Array.isArray(ind) && ind.length === 0) ind = null;
      if (!ind) ind = raw.organization__industries;
      if (Array.isArray(ind) && ind.length === 0) ind = null;
      if (Array.isArray(ind)) return ind.join("; ");
      return ind || "";
  } },
  { id: 'website', label: 'Website', showInUI: true, showInExport: true, extract: (raw) => {
      let w = raw.__original?.['Website'] || raw.website || raw.organization__website || raw.domain || raw.company_domain || raw.organization__website_url || raw.organization_website || "";
      if (!w && raw.logo && typeof raw.logo === 'string' && raw.logo.includes('key=')) {
          try {
              const base64 = raw.logo.split('key=')[1].split('&')[0];
              const decoded = Buffer.from(base64, 'base64').toString('utf-8');
              if (decoded.includes('logo.clearbit.com/')) {
                  w = decoded.split('logo.clearbit.com/')[1].split('?')[0].split('/')[0];
              }
          } catch(e) {}
      }
      return w;
  } },
  { id: 'company_linkedin_url', label: 'Company Linkedin Url', showInUI: true, showInExport: true, extract: (raw) => {
      let url = raw.__original?.['Company Linkedin Url'] || raw.__original?.['LinkedIn URL'] || raw.company_linkedin_url || raw.organization__linkedin_url || raw.linkedin_url || "";
      if (!url && Array.isArray(raw.experience) && raw.experience.length > 0) {
          const currentCompany = raw.current_positions?.[0]?.company || raw.company || "";
          if (currentCompany) {
              const exp = raw.experience.find(e => e.company?.name && e.company.name.toLowerCase().includes(currentCompany.toLowerCase()));
              if (exp && exp.company?.url) {
                  url = exp.company.url;
              }
          }
      }
      return url;
  } },
  { id: 'facebook_url', label: 'Facebook Url', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Facebook Url'] || raw.__original?.['Facebook URL'] || raw.facebook_url || raw.organization__facebook_url || "" },
  { id: 'twitter_url', label: 'Twitter Url', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Twitter Url'] || raw.__original?.['Twitter URL'] || raw.twitter_url || raw.organization__twitter_url || "" },
  { id: 'company_street', label: 'Company Street', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Street'] || raw.company_street || raw.organization__street || "" },
  { id: 'company_city', label: 'Company City', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company City'] || raw.__original?.['City'] || raw.organization__city || raw.city || raw.company_city || raw.contact__city || raw.location_city || (raw.location || "").split(",")[0]?.trim() || "" },
  { id: 'company_state', label: 'Company State', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company State'] || raw.__original?.['State'] || raw.company_state || raw.organization__state || raw.state || "" },
  { id: 'company_country', label: 'Company Country', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Country'] || raw.__original?.['Country'] || raw.organization__country || raw.country || raw.company_country || raw.contact__country || raw.location_country || (raw.location || "").split(",")[2]?.trim() || "" },
  { id: 'company_postal_code', label: 'Company Postal Code', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Postal Code'] || raw.__original?.['Postal Code'] || raw.company_postal_code || raw.organization__postal_code || raw.postal_code || "" },
  { id: 'company_address', label: 'Company Address', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Address'] || raw.__original?.['Address'] || getArrayStr(raw.organization__address || raw.address || raw.company_address || raw.organization__raw_address || raw.contact__address) },
  { id: 'keywords', label: 'Keywords', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Keywords']) return raw.__original['Keywords'];
      let kw = raw.keywords;
      if (Array.isArray(kw) && kw.length === 0) kw = null;
      kw = kw || raw.organization__keywords || raw.skills || raw.overview || "";
      return Array.isArray(kw) ? kw.join("; ") : kw;
  } },
  { id: 'company_phone', label: 'Company Phone', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Company Phone'] || raw.company_phone || raw.organization__phone || raw.phone || "" },
  { id: 'technologies', label: 'Technologies', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Technologies']) return raw.__original['Technologies'];
      const orgTech = Array.isArray(raw.organization__technologies) && raw.organization__technologies.length > 0 ? raw.organization__technologies : null;
      const tech = Array.isArray(raw.technologies) && raw.technologies.length > 0 ? raw.technologies : null;
      const curTech = Array.isArray(raw.organization__current_technologies) && raw.organization__current_technologies.length > 0 ? raw.organization__current_technologies : null;
      return getArrayStr(orgTech || tech || curTech || raw.organization__technologies || raw.technologies || raw.organization__current_technologies);
  } },
  { id: 'total_funding', label: 'Total Funding', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Total Funding'] || getArrayStr(raw.organization__total_funding || raw.total_funding) },
  { id: 'latest_funding', label: 'Latest Funding', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Latest Funding'] || getArrayStr(raw.organization__latest_funding || raw.latest_funding) },
  { id: 'latest_funding_amount', label: 'Latest Funding Amount', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Latest Funding Amount'] || getArrayStr(raw.organization__latest_funding_amount || raw.latest_funding_amount) },
  { id: 'last_raised_at', label: 'Last Raised At', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Last Raised At'] || getArrayStr(raw.organization__last_raised_at || raw.last_raised_at) },
  { id: 'annual_revenue', label: 'Annual Revenue', showInUI: true, showInExport: true, extract: (raw) => {
      if (raw.__original?.['Annual Revenue']) return raw.__original['Annual Revenue'];
      if (raw.revenue_min || raw.revenue_max) {
        if (raw.revenue_min === raw.revenue_max) return `$${raw.revenue_min}`;
        return `$${raw.revenue_min} - $${raw.revenue_max}`;
      }
      return raw.annual_revenue || raw.organization__annual_revenue || "";
  } },
  { id: 'short_description', label: 'Short Description', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Short Description'] || raw.__original?.['Description'] || raw.short_description || raw.organization__short_description || raw.description || "" },
  { id: 'founded_year', label: 'Founded Year', showInUI: true, showInExport: true, extract: (raw) => raw.__original?.['Founded Year'] || raw.founded_at || raw.founded_year || raw.organization__founded_year || "" }
];

module.exports = {
  peopleColumns,
  aiPeopleColumns,
  companyColumns
};
