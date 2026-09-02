export const normalizeToListRaw = (raw, overrideUrl = "") => {
  const safe = raw || {};
  
  // Try mapping deep nested fields from search API schema
  const pos0 = Array.isArray(safe.current_positions) ? safe.current_positions[0] : null;
  const deepCompany = pos0?.company || "";
  const deepTitle = pos0?.title || pos0?.role || "";
  const deepLocation = safe.location_city ? `${safe.location_city}${safe.location_country ? `, ${safe.location_country}` : ""}` : safe.location || "";
  const deepCity = safe.location_city || "";
  const deepCountry = safe.location_country || "";
  const deepPhoto = safe.logo || "";
  const deepSummary = safe.summary || "";

  const nameSource = safe.contact__name || safe.name || safe.full_name || `${safe.first_name || ""} ${safe.last_name || ""}`.trim() || "";
  const nameTokens = nameSource ? nameSource.split(/[•\s]+/).filter(Boolean) : [];
  const first = safe.contact__first_name || safe.first_name || nameTokens[0] || "";
  const last = safe.contact__last_name || safe.last_name || (nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : "");
  const headline = safe.contact__headline || safe.headline || deepSummary || "";
  const city = safe.contact__city || safe.city || deepCity || "";
  const state = safe.contact__state || safe.state || "";
  const country = safe.contact__country || safe.country || deepCountry || "";
  const location = safe.location || deepLocation || [city, state, country].filter(Boolean).join(", ");
  const photo = safe.contact__photo_url || safe.profile_picture_url || safe.photo || safe.avatar || safe.image_url || deepPhoto || "";
  const linkedinUrl = String(safe.contact__linkedin_url || safe.linkedin_url || safe.public_profile_url || safe.profile_url || safe.url || overrideUrl || "").trim();
  const publicProfileUrl = String(safe.public_profile_url || linkedinUrl).trim();
  const profileUrl = String(safe.profile_url || safe.url || linkedinUrl).trim();
  // Helper to extract company-specific details from experience array based on the matched company name
  const extractCompanyDetails = (companyName, experienceArray) => {
    if (!companyName || !Array.isArray(experienceArray)) return {};
    const lowerName = String(companyName).toLowerCase().trim();
    
    for (const exp of experienceArray) {
      const expCompName = String(exp.company?.name || exp.companyName || (typeof exp.company === 'string' ? exp.company : "")).toLowerCase().trim();
      if (expCompName && (expCompName === lowerName || expCompName.includes(lowerName) || lowerName.includes(expCompName))) {
        return {
          website: exp.company?.domain || exp.company?.website || "",
          linkedin_url: exp.company?.url || exp.company?.linkedinUrl || exp.company?.linkedin_url || "",
          industry: exp.company?.industry || "",
          headcount: exp.company?.employeeCount || exp.company?.size || ""
        };
      }
    }
    return {};
  };

  const companyFromCurrent = Array.isArray(safe.employmentHistory) ? (safe.employmentHistory.find((j)=>j.current)?.companyName || safe.employmentHistory[0]?.companyName) : "";
  const roleFromCurrent = Array.isArray(safe.employmentHistory) ? (safe.employmentHistory.find((j)=>j.current)?.title || safe.employmentHistory[0]?.title) : "";
  const title = safe.contact__title || safe.title || deepTitle || roleFromCurrent || safe.headline || "";
  const company = safe.contact__organization_name || safe.company || deepCompany || safe.company_name || companyFromCurrent || (typeof safe.company === "string" ? safe.company : "");

  const matchedCompanyDetails = extractCompanyDetails(company, safe.experience || safe.employmentHistory);

  // Fallback to root if specific details aren't found
  const website = pos0?.website || matchedCompanyDetails.website || safe.contact__organization_domain || safe.organization__domain || safe.website || safe.domain || "";
  const companyLinkedinUrl = pos0?.company_linkedin_url || pos0?.linkedin_url || matchedCompanyDetails.linkedin_url || safe.organization__linkedin_url || safe.company_linkedin_url || safe.companyLinkedinUrl || "";
  const finalIndustry = Array.isArray(safe.contact__industry) ? safe.contact__industry : (Array.isArray(safe.industry) ? safe.industry : (Array.isArray(safe.organization__industry) ? safe.organization__industry : (pos0?.industry || (matchedCompanyDetails.industry ? [matchedCompanyDetails.industry] : []))));
  
  const emailListAll = Array.isArray(safe.contact__all_emails) ? safe.contact__all_emails : (Array.isArray(safe.contact__emails) ? safe.contact__emails : []);
  const emailStatusRaw = safe.contact__email_status || (emailListAll.find((e)=>e?.verificationStatus)?.verificationStatus) || "";
  const emailPrimary = emailListAll.find((e)=>e?.email)?.email || safe.contact__email || safe.email || "";
  const phonesArr = Array.isArray(safe.contact__phone_numbers) ? safe.contact__phone_numbers : (Array.isArray(safe.contact__phones) ? safe.contact__phones : (Array.isArray(safe.phones) ? safe.phones : []));
  const phone1 = phonesArr[0] ? (phonesArr[0].sanitized_number || phonesArr[0].raw_number || "") : "";
  const phone1Type = phonesArr[0]?.type || "";
  const phone2 = phonesArr[1] ? (phonesArr[1].sanitized_number || phonesArr[1].raw_number || "") : "";
  const phone2Type = phonesArr[1]?.type || "";
  
  // Format experience properly for current_positions if it exists
  const formatExperience = (exp) => {
    if (!Array.isArray(exp)) return [];
    return exp.flatMap(e => {
      const c = e.company?.name || "";
      if (!Array.isArray(e.positions)) return [];
      return e.positions.map(p => ({
        company: c,
        role: p.title || "",
        startDate: p.startDateYear ? `${p.startDateYear}-${p.startDateMonth || 1}` : "",
        endDate: p.endDateYear ? `${p.endDateYear}-${p.endDateMonth || 1}` : "",
        current: !p.endDateYear
      }));
    });
  };

  const currentPositions = Array.isArray(safe.employmentHistory) ? safe.employmentHistory.map((j)=>({ company: j?.companyName || "", role: j?.title || "", startDate: j?.startDate || "", endDate: j?.endDate || "", current: !!j?.current })) : (Array.isArray(safe.current_positions) ? safe.current_positions : formatExperience(safe.experience));
  const cleanLinkedinUrl = linkedinUrl.split('?')[0];
  const idFromUrl = cleanLinkedinUrl ? (cleanLinkedinUrl.split("/").filter(Boolean).pop() || "") : safe.id || "";
  const mapStatus = (s) => {
    const v = String(s || "").toLowerCase();
    if (v === "deliverable") return "Verified A+";
    if (v === "valid") return "Valid B+";
    if (v === "undeliverable" || v === "unknown") return "Unverified";
    return s || "";
  };
  const normalized = {
    ...safe,
    first_name: first || "N/A",
    last_name: last || "N/A",
    headline: headline || "N/A",
    location: location || "N/A",
    profile_picture_url: photo || "",
    linkedin_url: linkedinUrl || "",
    public_profile_url: publicProfileUrl || "",
    profile_url: profileUrl || "",
    industry: finalIndustry,
    email: emailPrimary || "",
    email_status: mapStatus(emailStatusRaw) || "N/A",
    phone: phone1 ? `${phone1}${phone1Type ? ` (${phone1Type})` : ""}` : "",
    second_phone: phone2 ? `${phone2}${phone2Type ? ` (${phone2Type})` : ""}` : "",
    title: title || "N/A",
    company: company || "N/A",
    current_positions: currentPositions,
    id: idFromUrl || "",
    name: nameSource || "",
    // Extend to normal list schema
    seniority: pos0?.seniority || pos0?.mawsool_seniority || safe.seniority || "",
    job_function: safe.job_function || safe.function || "",
    department: safe.department || safe.job_function || safe.function || "",
    departments: (Array.isArray(safe.departments) && safe.departments.length > 0) ? safe.departments : (safe.department ? [safe.department] : (safe.job_function ? [safe.job_function] : (safe.function ? [safe.function] : []))),
    corporate_phone: safe.corporate_phone || "",
    total_experience_years: safe.total_experience_years || "",
    employees: matchedCompanyDetails.headcount || safe.organization__estimated_num_employees || safe.employees || safe.company_headcount || safe.headcount || safe.current_employee_count || safe.employee_count || pos0?.employee_count || "",
    company_headcount: matchedCompanyDetails.headcount || safe.company_headcount || safe.headcount || pos0?.employee_count || "",
    current_employee_count: matchedCompanyDetails.headcount || safe.current_employee_count || pos0?.employee_count || "",
    employee_count: matchedCompanyDetails.headcount || safe.employee_count || pos0?.employee_count || "",
    _source: safe._source || "",
    keywords: Array.isArray(safe.organization__keywords) ? safe.organization__keywords : (Array.isArray(safe.keywords) ? safe.keywords : (Array.isArray(safe.skills) ? safe.skills : [])),
    website: website,
    company_linkedin_url: companyLinkedinUrl,
    city: city,
    state: state,
    country: country,
    address: safe.organization__raw_address || safe.address || "",
    company_city: safe.organization__city || safe.company_city || "",
    company_state: safe.organization__state || safe.company_state || "",
    company_country: safe.organization__country || safe.company_country || "",
    technologies: Array.isArray(safe.organization__current_technologies) ? safe.organization__current_technologies : (Array.isArray(safe.technologies) ? safe.technologies : []),
    headers: Array.isArray(safe.__headers) ? safe.__headers : [],
    original: safe.original || "",
    public_identifier: safe.public_identifier || "",
    facebook_url: safe.organization__facebook_url || safe.facebook_url || "",
    twitter_url: safe.organization__twitter_url || safe.twitter_url || "",
    annual_revenue: safe.organization__annual_revenue || safe.annual_revenue || "",
    total_funding: safe.organization__total_funding || safe.total_funding || "",
    latest_funding: safe.organization__latest_funding_stage || safe.latest_funding || "",
    latest_funding_amount: safe.organization__latest_funding_amount || safe.latest_funding_amount || "",
    last_raised_at: safe.organization__latest_funding_round_date || safe.last_raised_at || "",
    // Preserve multi-value arrays for richer UI rendering
    contact__all_emails: Array.isArray(safe.contact__all_emails)
      ? safe.contact__all_emails
      : (Array.isArray(safe.contact__emails) ? safe.contact__emails : []),
    contact__phone_numbers: Array.isArray(safe.contact__phone_numbers)
      ? safe.contact__phone_numbers
      : (Array.isArray(safe.contact__phones) ? safe.contact__phones : []),
    // Contact Info Lists
    personal_emails: Array.isArray(safe.personal_emails) ? safe.personal_emails : [],
    work_emails: Array.isArray(safe.work_emails) ? safe.work_emails : [],
    mobile_numbers: Array.isArray(safe.mobile_numbers) ? safe.mobile_numbers : []
  };
  return normalized;
};
