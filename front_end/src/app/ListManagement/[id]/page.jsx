"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminRoute from "@/components/AdminRoute";
import DashboardContainer from "@/components/dashboardLayoutContainer";
import Papa from "papaparse";
import Swal from "sweetalert2";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

// ====== FULL, ROBUST fieldMappings (DB keys are snake_case) ======
const fieldMappings = {
  first_name: ["first name", "firstname", "fname", "given name", "first_name", "First Name"],
  last_name: ["last name", "lastname", "lname", "surname", "family name", "last_name", "Last Name"],
  name: ["name", "full name", "fullname", "Full Name"],

  company: ["company", "organization", "employer", "business", "company name", "Company", "Company Name"],
    title: ["title", "job title", "role", "position", "Title", "Job Title", "Role", "Position"],
    seniority: ["seniority", "level", "Seniority", "Level"],
    departments: ["departments", "department", "dept", "Departments", "Department", "Dept"],
    industry: ["industry", "Industry"],
    employees: ["employees", "company headcount", "# employees", "Employees", "Company Headcount", "# Employees"],
    founded_year: ["founded year", "founded_year", "Founded Year"],
    annual_revenue: ["annual revenue", "annual_revenue", "Annual Revenue"],
    total_funding: ["total funding", "total_funding", "Total Funding"],
    latest_funding: ["latest funding", "latest_funding", "Latest Funding"],
    latest_funding_amount: ["latest funding amount", "latest_funding_amount", "Latest Funding Amount"],
    last_raised_at: ["last raised at", "last_raised_at", "Last Raised At"],
    technologies: ["technologies", "Technologies"],
    keywords: ["keywords", "Keywords"],
    short_description: ["short description", "description", "Short Description", "Description"],
    company_phone: ["company phone", "company_phone", "Company Phone"],

    email: ["email", "email address", "e-mail", "mail", "email_address", "Email", "Email Address"],
  email_status: [
    "email status", "email_status", "email verification status", "status of email",
    "email verified", "verification status", "Email Status", "Email Verified"
  ],
  phone: [
    "mobile phone", "mobile", "cell phone", "phone", "telephone",
    "mobile_phone", "cell_phone", "contact number", "phone number",
    "Phone", "Mobile", "Cell Phone", "Contact Number", "Phone Number", "Telephone"
  ],
  second_phone: [
    "second phone", "alternate phone", "alt phone", "secondary phone",
    "Second Phone", "Alternate Phone", "Secondary Phone", "Alt Phone"
  ],
  corporate_phone: ["corporate phone", "office phone", "work phone", "Corporate Phone", "Office Phone", "Work Phone"],

  public_identifier: ["public identifier", "public_id", "public_identifier", "Public Identifier"],
  linkedin_url: [
    "linkedin url", "linkedin", "linkedin_url", "person linkedin url",
    "profile linkedin", "linkedin profile", "LinkedIn URL", "Person Linkedin Url", "LinkedIn"
  ],
  facebook_url: ["facebook url", "facebook", "facebook_url", "Facebook URL"],
  twitter_url: ["twitter url", "twitter", "twitter_url", "x url", "Twitter URL", "X URL"],

  public_profile_url: ["public profile url", "public_profile", "public_profile_url", "Public Profile URL"],
  profile_url: ["profile url", "profile", "profile_url", "Profile URL"],

  profile_picture_url: [
    "profile picture url", "profile_picture", "profile_picture_url",
    "image", "image url", "photo", "picture", "avatar", "display picture", "dp",
    "profile image", "profile photo", "Image", "Image URL", "Profile Photo", "Profile Image"
  ],
  profile_picture_url_large: [
    "profile picture url large", "profile_picture_large", "profile_picture_url_large",
    "image large", "image high res", "photo large", "picture large", "avatar large",
    "high res image", "High Res Image", "Image Large"
  ],

  network_distance: ["network distance", "network_distance", "connection distance", "Network Distance"],
  location: ["location", "place", "Location", "Place"],

  headline: ["headline", "tagline", "Headline", "Tagline"],
  current_positions: ["current positions", "current position", "current_positions", "positions", "Current Positions", "Current Position"],

  industry: ["industry", "sector", "business type", "vertical", "Industry", "Sector", "Business Type", "Vertical"],
  website: ["website", "web site", "url", "homepage", "company website", "site", "Website", "Company Website", "Homepage"],

  city: ["city", "location city", "town", "City", "Town"],
  state: ["state", "province", "State"],
  country: ["country", "nation", "Country", "Nation"],
  address: ["address", "street address", "company address", "street", "Address", "Street Address"],
  zip_code: ["zip", "zip code", "postal code", "zipcode", "postcode", "Zip", "Zip Code", "Postal Code", "Postcode"],

  // Company meta
  company_linkedin_url: [
    "company linkedin url", "employer linkedin url", "organization linkedin",
    "Company Linkedin Url", "Employer Linkedin Url", "Organization Linkedin"
  ],
  company_address: ["company address", "company_address", "Company Address"],
  company_city: ["company city", "employer city", "organization city", "Company City", "Employer City", "Organization City"],
  company_state: ["company state", "company_state", "Company State"],
  company_country: ["company country", "employer country", "organization country", "Company Country", "Employer Country", "Organization Country"],
  company_street: ["company street", "company_street", "Company Street"],
  company_postal_code: ["company postal code", "company postal", "company_postal_code", "Company Postal Code"],

  // Funding / revenue
  annual_revenue: ["annual revenue", "revenue", "yearly revenue", "Annual Revenue", "Revenue", "Yearly Revenue"],
  total_funding: ["total funding", "funding total", "Total Funding", "Funding Total"],
  latest_funding: ["latest funding", "recent funding round", "Latest Funding", "Recent Funding Round"],
  latest_funding_amount: ["latest funding amount", "recent funding amount", "Latest Funding Amount", "Recent Funding Amount"],
  last_raised_at: ["last raised at", "last round date", "last funding date", "Last Raised At", "Last Round Date", "Last Funding Date"],

  technologies: ["technologies", "tech stack", "stack", "Technology", "Technologies", "Tech Stack"],

  // Keywords / tags
  keywords: ["keywords", "tags", "Keywords", "Tags"],
};

// ====== helpers ======
const toSnake = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

// fuzzy matcher to catch common headers
const specialHeuristics = (colNorm) => {
  // phones
  if (/\b(second|secondary|alternate|alt)\b.*\b(phone|contact|mobile|cell)\b/.test(colNorm)) return "second_phone";
  if (/\b(corporate|office|work)\b.*\b(phone|contact|mobile|cell)\b/.test(colNorm)) return "corporate_phone";
  if (/\b(phone|contact|mobile|cell)\b/.test(colNorm)) return "phone";
  // headcount
  if (/\b(no|number|count|#)\b.*\b(employees|employee|headcount|team)\b/.test(colNorm)) return "no_of_employees";
  // images
  if (/\b(image|photo|picture|avatar|dp|display picture)\b/.test(colNorm)) return "profile_picture_url";
  // linkedin
  if (/\blinkedin\b/.test(colNorm) && /\b(company|employer|organization)\b/.test(colNorm)) return "company_linkedin_url";
  if (/\blinkedin\b/.test(colNorm)) return "linkedin_url";
  // email status
  if (/\bemail\b/.test(colNorm) && /\b(status|verified|verification)\b/.test(colNorm)) return "email_status";
  // company location
  if (/\bcompany\b.*\bcity\b/.test(colNorm)) return "company_city";
  if (/\bcompany\b.*\bcountry\b/.test(colNorm)) return "company_country";
  // funding/revenue/tech
  if (/\bannual\b.*\brevenue\b/.test(colNorm)) return "annual_revenue";
  if (/\btotal\b.*\bfunding\b/.test(colNorm)) return "total_funding";
  if (/\blatest\b.*\bfunding\b.*\bamount\b/.test(colNorm)) return "latest_funding_amount";
  if (/\blatest\b.*\bfunding\b/.test(colNorm)) return "latest_funding";
  if (/\blast\b.*\braised\b/.test(colNorm) || /\blast\b.*\bfunding\b.*\bdate\b/.test(colNorm)) return "last_raised_at";
  if (/\btechnolog(y|ies)\b|\btech stack\b|\bstack\b/.test(colNorm)) return "technologies";
  return "";
};

export default function QueryDetailPage() {
  const [queryData, setQueryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvFirstRow, setCsvFirstRow] = useState({});
  const [columnMappings, setColumnMappings] = useState({});
  const [dbFields, setDbFields] = useState([]);

  const params = useParams();
  const router = useRouter();
  const effectiveId = params?.id || params?.queryId;

  // Fetch known fields when drawer opens
  useEffect(() => {
    if (isDrawerOpen) {
      const fetchKnownFields = async () => {
        try {
          const res = await fetch(`${config.apiUrl}/api/admin/known-fields`, {
            credentials: "include",
          });
          if (!res.ok) throw new Error("Failed to fetch known fields");
          const fields = await res.json();
          setDbFields(fields);
        } catch (err) {
          console.error("Error fetching known fields:", err);
          setDbFields([
            "first_name",
            "last_name",
            "industry",
            "public_identifier",
            "linkedin_url",
            "public_profile_url",
            "profile_url",
            "profile_picture_url",
            "profile_picture_url_large",
            "network_distance",
            "location",
            "headline",
            "current_positions",
            "email",
            "phone",
            "status",
          ]);
        }
      };
      fetchKnownFields();
    }
  }, [isDrawerOpen]);

  // Handle Escape key to close drawer
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape") setIsDrawerOpen(false);
    };
    if (isDrawerOpen) {
      window.addEventListener("keydown", handleEsc);
      return () => window.removeEventListener("keydown", handleEsc);
    }
  }, [isDrawerOpen]);

  // Drawer animation
  useEffect(() => {
    if (isDrawerOpen) setIsAnimating(true);
    else {
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isDrawerOpen]);

  // ====== UPDATED parseCsv with alias → heuristics → snake_case fallback ======
  const parseCsv = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          Swal.fire({
            icon: "error",
            title: "Error parsing CSV",
            text: results.errors[0].message,
          });
          return;
        }
        const columns = results.meta.fields || [];
        const firstRow = results.data[0] || {};
        setCsvColumns(columns);
        setCsvFirstRow(firstRow);

        const initialMappings = {};
        columns.forEach((col) => {
          const colNorm = col.toLowerCase().trim();
          let matchedField = "";

          // 1) alias table
          Object.entries(fieldMappings).some(([dbField, aliases]) => {
            if (aliases.map((a) => a.toLowerCase()).includes(colNorm)) {
              matchedField = dbField;
              return true;
            }
            return false;
          });

          // 2) heuristics
          if (!matchedField) matchedField = specialHeuristics(colNorm);

          // 3) fallback to snake_case of the header
          if (!matchedField) matchedField = toSnake(col);

          initialMappings[col] = matchedField;
        });

        setColumnMappings(initialMappings);
      },
    });
  };

  useEffect(() => {
    const fetchQueryDetail = async (id) => {
      try {
        setLoading(true);
        const res = await fetch(`${config.apiUrl}/api/admin/queries/${id}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to fetch query details (${res.status})`);
        }
        const data = await res.json();
        if (!data?.query) throw new Error("No query data found in response");
        setQueryData(data.query);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (effectiveId) fetchQueryDetail(effectiveId);
    else {
      setError("No query ID found in URL parameters");
      setLoading(false);
    }
  }, [effectiveId]);

  const totalAppliedFilters = useMemo(() => {
    if (!queryData?.searchFilter) return 0;
    return Object.values(queryData.searchFilter).reduce((acc, v) => {
      const count = Array.isArray(v?.include) ? v.include.length : 0;
      return acc + count;
    }, 0);
  }, [queryData]);

  const StatusPill = ({ status }) => {
    const s = (status || "").toLowerCase();
    const styles =
      s === "completed"
        ? "bg-green-600 text-white"
        : s === "in progress" || s === "processing" || s === "pending"
        ? "bg-blue-700 text-white"
        : "bg-gray-600 text-white";
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>
        {status || "Unknown"}
      </span>
    );
  };

  const handleSetActive = async () => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This will mark the list as active with NO results. The user will be notified.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, activate it!",
    });

    if (result.isConfirmed) {
      try {
        setUploading(true); // Re-use loading state or add a new one
        const res = await fetch(`${config.apiUrl}/api/admin/queries/${effectiveId}/activate-no-results`, {
          method: "PUT",
          credentials: "include",
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Failed to activate list.");
        }

        const data = await res.json();
        await Swal.fire("Success", data.message || "List activated successfully.", "success");
        window.location.reload();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      } finally {
        setUploading(false);
      }
    }
  };

  const FiltersTable = ({ searchFilter }) => {
    const categories = searchFilter
      ? Object.keys(searchFilter).filter((c) => {
          const f = searchFilter[c];
          return Array.isArray(f?.include) && f.include.length > 0;
        })
      : [];

    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 md:px-6">
          <div className="text-sm font-medium text-gray-700">Filters Applied: {totalAppliedFilters}</div>
          <div className="flex gap-2">
            <button
              onClick={handleSetActive}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-green-700"
              disabled={uploading}
            >
              Set Active (No Results)
            </button>
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#04145C] px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#052074]"
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Upload CSV"}
            </button>
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No filters applied.</div>
        ) : (
          <>
            <div className="hidden grid-cols-12 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 md:grid md:px-6">
              <div className="col-span-3">Filter</div>
              <div className="col-span-8">Selected Values</div>
              <div className="col-span-1 text-center"></div>
            </div>
            <div className="divide-y divide-gray-200">
              {categories.map((category) => {
                const f = searchFilter[category];
                const labels = (f.include || []).map((id) => f.includeLabels?.[id] || String(id));
                return (
                  <div
                    key={category}
                    className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-gray-50 md:grid-cols-12 md:gap-0 md:px-6"
                  >
                    <div className="col-span-3 flex items-center text-sm font-medium text-gray-800">
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </div>
                    <div className="col-span-8 flex flex-wrap items-center gap-2">
                      {labels.map((label, idx) => (
                        <span
                          key={`${category}-${idx}-${label}`}
                          className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="col-span-1 hidden items-center justify-center md:flex"></div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <AdminRoute>
        <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-700">Loading query details…</div>
      </AdminRoute>
    );
  }

  if (error) {
    return (
      <AdminRoute>
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50 text-gray-700">
          <p className="text-red-600">Error: {error}</p>
          <button
            onClick={() => router.refresh()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </AdminRoute>
    );
  }

  return (
    <DashboardContainer>
      <AdminRoute>
        <div className="min-h-screen bg-gray-50 p-4 text-gray-800 md:p-6">
          <div className="rounded-xl border-2 border-dotted border-blue-300 bg-white p-4 shadow md:p-6">
            <div className="mb-4 flex flex-col justify-between gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-center">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/ListManagement")}
                  className="cursor-pointer rounded-md bg-gray-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  ← Back
                </button>
                <h1 className="text-xl font-semibold">
                  Filters
                  {["company", "companies"].includes(String(queryData?.listType || "").toLowerCase()) && (
                    <span className="ml-3 inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700">
                      Companies List
                    </span>
                  )}
                </h1>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 md:grid-cols-4">
                <div>
                  <div className="font-semibold text-gray-800">Query ID</div>
                  <div className="truncate">{queryData?.id || "N/A"}</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-800">User Name</div>
                  <div>{queryData?.userName || "N/A"}</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-800">List Name</div>
                  <div>{queryData?.listName || "N/A"}</div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="font-semibold text-gray-800">Status</div>
                  <div className="mt-0.5">
                    <StatusPill status={queryData?.status} />
                  </div>
                </div>
              </div>
            </div>
            <FiltersTable searchFilter={queryData?.searchFilter} />
            {queryData?.prompt && (
              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-2 text-sm font-semibold text-gray-700">Prompt</div>
                <div className="text-sm text-gray-700">{queryData.prompt}</div>
              </div>
            )}

            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 text-sm font-semibold text-gray-700">Number if Leads</div>
              <div className="inline-flex items-center text-xs font-medium">{queryData.numLeads}</div>
            </div>

            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 text-sm font-semibold text-gray-700">Include Phone</div>
              <div
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium
                  ${
                    queryData.includePhone
                      ? "bg-green-100 text-green-700 border border-green-300"
                      : "bg-red-100 text-red-700 border border-red-300"
                  }`}
              >
                {queryData.includePhone ? "Yes" : "No"}
              </div>
            </div>
          </div>
        </div>

        {isAnimating && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div
              className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ease-in-out ${
                isDrawerOpen ? "opacity-100" : "opacity-0"
              }`}
              onClick={() => setIsDrawerOpen(false)}
            ></div>

            <div
              className={`relative w-[720px] bg-white p-6 shadow-lg transform transition-transform duration-300 ease-in-out ${
                isDrawerOpen ? "translate-x-0" : "translate-x-full"
              }`}
              onTransitionEnd={() => {
                if (!isDrawerOpen) setIsAnimating(false);
              }}
            >
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
              <h2 className="text-lg font-semibold mb-4">Upload and Map CSV</h2>
              <p className="text-sm text-gray-600 mb-2">Map CSV columns to database fields.</p>

              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setCsvFile(file);
                    parseCsv(file);
                  }
                }}
                className="mb-4 w-full border rounded p-1"
              />

              {csvColumns.length > 0 && (
                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {csvColumns.map((col) => (
                    <div key={col} className="flex items-center gap-2">
                      <div className="w-1/3 text-sm font-medium truncate">{col}</div>
                      <div className="w-1/3 relative">
                        <input
                          type="text"
                          list="dbFields"
                          value={columnMappings[col] || ""}
                          onChange={(e) => setColumnMappings({ ...columnMappings, [col]: e.target.value })}
                          className="w-full border rounded p-1 text-sm bg-gray-50"
                          placeholder="Type or select field"
                        />
                        {columnMappings[col] && !dbFields.includes(columnMappings[col]) && (
                          <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-blue-600">
                            New
                          </span>
                        )}
                        {columnMappings[col] &&
                          fieldMappings[columnMappings[col]]?.map((a) => a.toLowerCase()).includes(col.toLowerCase().trim()) && (
                            <span className="absolute right-8 top-1/2 transform -translate-y-1/2 text-xs text-green-600">
                              Auto
                            </span>
                          )}
                      </div>
                      <div className="w-1/3 text-sm text-gray-500 truncate">{csvFirstRow[col] || "N/A"}</div>
                    </div>
                  ))}
                  <datalist id="dbFields">
                    {dbFields.map((field) => (
                      <option key={field} value={field} />
                    ))}
                  </datalist>
                </div>
              )}

              <button
                onClick={async () => {
                  if (!csvFile) {
                    Swal.fire({ icon: "error", title: "No CSV File Selected", text: "Please select a CSV file." });
                    return;
                  }
                  
                  const isCompanies = ["company", "companies"].includes(String(queryData?.listType || "").toLowerCase());
                  
                  if (isCompanies) {
                    if (!Object.values(columnMappings).includes("company") && !Object.values(columnMappings).includes("name")) {
                      Swal.fire({
                        icon: "error",
                        title: "Missing Company Mapping",
                        text: "Please map 'company' or 'name' to a CSV column.",
                      });
                      return;
                    }
                  } else {
                    if (!(Object.values(columnMappings).includes("first_name") && Object.values(columnMappings).includes("last_name"))) {
                      Swal.fire({
                        icon: "error",
                        title: "Missing Name Mapping",
                        text: "Please map both 'first_name' and 'last_name' to a CSV column.",
                      });
                      return;
                    }
                  }
                  
                  setUploading(true);
                  try {
                    const formData = new FormData();
                    formData.append("leadsFile", csvFile);
                    formData.append("mappings", JSON.stringify(columnMappings));
                    const res = await fetch(`${config.apiUrl}/api/admin/queries/${effectiveId}/upload`, {
                      method: "POST",
                      body: formData,
                      credentials: "include",
                    });
                    if (!res.ok) {
                      const errData = await res.json().catch(() => ({}));
                      throw new Error(errData.message || "Upload failed");
                    }
                    const result = await res.json();
                    Swal.fire({ icon: "success", title: "Success", text: result.message || "Uploaded successfully!" });
                    setIsDrawerOpen(false);
                    setCsvFile(null);
                    setCsvColumns([]);
                    setCsvFirstRow({});
                    setColumnMappings({});
                  } catch (err) {
                    Swal.fire({ icon: "error", title: "Upload Failed", text: err.message || "An error occurred during upload." });
                  } finally {
                    setUploading(false);
                  }
                }}
                className="mt-4 w-full text-white px-4 py-2 rounded-xl bg-[#04145C] hover:bg-[#052074] disabled:bg-blue-400"
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Upload with Mapping"}
              </button>
            </div>
          </div>
        )}
      </AdminRoute>
    </DashboardContainer>
  );
}
