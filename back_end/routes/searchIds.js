const express = require("express");
const router = express.Router();
const axios = require("axios");
const { isAuthenticated } = require("../middlewares/authMiddleware");

const COUNTRY_MAP = {
  "AF": "Afghanistan",
  "AL": "Albania",
  "DZ": "Algeria",
  "AS": "American Samoa",
  "AD": "Andorra",
  "AO": "Angola",
  "AI": "Anguilla",
  "AQ": "Antarctica",
  "AG": "Antigua and Barbuda",
  "AR": "Argentina",
  "AM": "Armenia",
  "AW": "Aruba",
  "AU": "Australia",
  "AT": "Austria",
  "AZ": "Azerbaijan",
  "BS": "Bahamas",
  "BH": "Bahrain",
  "BD": "Bangladesh",
  "BB": "Barbados",
  "BY": "Belarus",
  "BE": "Belgium",
  "BZ": "Belize",
  "BJ": "Belin",
  "BM": "Bermuda",
  "BT": "Bhutan",
  "BO": "Bolivia",
  "BA": "Bosnia and Herzegovina",
  "BW": "Botswana",
  "BV": "Bouvet Island",
  "BR": "Brazil",
  "IO": "British Indian Ocean Territory",
  "BN": "Brunei Darussalam",
  "BG": "Bulgaria",
  "BF": "Burkina Faso",
  "BI": "Burundi",
  "KH": "Cambodia",
  "CM": "Cameroon",
  "CA": "Canada",
  "CV": "Cape Verde",
  "KY": "Cayman Islands",
  "CF": "Central African Republic",
  "TD": "Chad",
  "CL": "Chile",
  "CN": "China",
  "CX": "Christmas Island",
  "CC": "Cocos (Keeling) Islands",
  "CO": "Colombia",
  "KM": "Comoros",
  "CG": "Congo",
  "CD": "Congo, Democratic Republic of the",
  "CK": "Cook Islands",
  "CR": "Costa Rica",
  "CI": "Cote D'Ivoire",
  "HR": "Croatia",
  "CU": "Cuba",
  "CY": "Cyprus",
  "CZ": "Czech Republic",
  "DK": "Denmark",
  "DJ": "Djibouti",
  "DM": "Dominica",
  "DO": "Dominican Republic",
  "EC": "Ecuador",
  "EG": "Egypt",
  "SV": "El Salvador",
  "GQ": "Equatorial Guinea",
  "ER": "Eritrea",
  "EE": "Estonia",
  "ET": "Ethiopia",
  "FK": "Falkland Islands (Malvinas)",
  "FO": "Faroe Islands",
  "FJ": "Fiji",
  "FI": "Finland",
  "FR": "France",
  "GF": "French Guiana",
  "PF": "French Polynesia",
  "TF": "French Southern Territories",
  "GA": "Gabon",
  "GM": "Gambia",
  "GE": "Georgia",
  "DE": "Germany",
  "GH": "Ghana",
  "GI": "Gibraltar",
  "GR": "Greece",
  "GL": "Greenland",
  "GD": "Grenada",
  "GP": "Guadeloupe",
  "GU": "Guam",
  "GT": "Guatemala",
  "GN": "Guinea",
  "GW": "Guinea-Bissau",
  "GY": "Guyana",
  "HT": "Haiti",
  "HM": "Heard Island and Mcdonald Islands",
  "VA": "Holy See (Vatican City State)",
  "HN": "Honduras",
  "HK": "Hong Kong",
  "HU": "Hungary",
  "IS": "Iceland",
  "IN": "India",
  "ID": "Indonesia",
  "IR": "Iran, Islamic Republic of",
  "IQ": "Iraq",
  "IE": "Ireland",
  "IT": "Italy",
  "JM": "Jamaica",
  "JP": "Japan",
  "JO": "Jordan",
  "KZ": "Kazakhstan",
  "KE": "Kenya",
  "KI": "Kiribati",
  "KP": "Korea, Democratic People's Republic of",
  "KR": "Korea, Republic of",
  "KW": "Kuwait",
  "KG": "Kyrgyzstan",
  "LA": "Lao People's Democratic Republic",
  "LV": "Latvia",
  "LB": "Lebanon",
  "LS": "Lesotho",
  "LR": "Liberia",
  "LY": "Libyan Arab Jamahiriya",
  "LI": "Liechtenstein",
  "LT": "Lithuania",
  "LU": "Luxembourg",
  "MO": "Macao",
  "MK": "Macedonia, The Former Yugoslav Republic of",
  "MG": "Madagascar",
  "MW": "Malawi",
  "MY": "Malaysia",
  "MV": "Maldives",
  "ML": "Mali",
  "MT": "Malta",
  "MH": "Marshall Islands",
  "MQ": "Martinique",
  "MR": "Mauritania",
  "MU": "Mauritius",
  "YT": "Mayotte",
  "MX": "Mexico",
  "FM": "Micronesia, Federated States of",
  "MD": "Moldova, Republic of",
  "MC": "Monaco",
  "MN": "Mongolia",
  "MS": "Montserrat",
  "MA": "Morocco",
  "MZ": "Mozambique",
  "MM": "Myanmar",
  "NA": "Namibia",
  "NR": "Nauru",
  "NP": "Nepal",
  "NL": "Netherlands",
  "AN": "Netherlands Antilles",
  "NC": "New Caledonia",
  "NZ": "New Zealand",
  "NI": "Nicaragua",
  "NE": "Niger",
  "NG": "Nigeria",
  "NU": "Niue",
  "NF": "Norfolk Island",
  "MP": "Northern Mariana Islands",
  "NO": "Norway",
  "OM": "Oman",
  "PK": "Pakistan",
  "PW": "Palau",
  "PS": "Palestinian Territory, Occupied",
  "PA": "Panama",
  "PG": "Papua New Guinea",
  "PY": "Paraguay",
  "PE": "Peru",
  "PH": "Philippines",
  "PN": "Pitcairn",
  "PL": "Poland",
  "PT": "Portugal",
  "PR": "Puerto Rico",
  "QA": "Qatar",
  "RE": "Reunion",
  "RO": "Romania",
  "RU": "Russian Federation",
  "RW": "Rwanda",
  "SH": "Saint Helena",
  "KN": "Saint Kitts and Nevis",
  "LC": "Saint Lucia",
  "PM": "Saint Pierre and Miquelon",
  "VC": "Saint Vincent and the Grenadines",
  "WS": "Samoa",
  "SM": "San Marino",
  "ST": "Sao Tome and Principe",
  "SA": "Saudi Arabia",
  "SN": "Senegal",
  "CS": "Serbia and Montenegro",
  "SC": "Seychelles",
  "SL": "Sierra Leone",
  "SG": "Singapore",
  "SK": "Slovakia",
  "SI": "Slovenia",
  "SB": "Solomon Islands",
  "SO": "Somalia",
  "ZA": "South Africa",
  "GS": "South Georgia and the South Sandwich Islands",
  "ES": "Spain",
  "LK": "Sri Lanka",
  "SD": "Sudan",
  "SR": "Suriname",
  "SJ": "Svalbard and Jan Mayen",
  "SZ": "Swaziland",
  "SE": "Sweden",
  "CH": "Switzerland",
  "SY": "Syrian Arab Republic",
  "TW": "Taiwan, Province of China",
  "TJ": "Tajikistan",
  "TZ": "Tanzania, United Republic of",
  "TH": "Thailand",
  "TL": "Timor-Leste",
  "TG": "Togo",
  "TK": "Tokelau",
  "TO": "Tonga",
  "TT": "Trinidad and Tobago",
  "TN": "Tunisia",
  "TR": "Turkey",
  "TM": "Turkmenistan",
  "TC": "Turks and Caicos Islands",
  "TV": "Tuvalu",
  "UG": "Uganda",
  "UA": "Ukraine",
  "AE": "United Arab Emirates",
  "GB": "United Kingdom",
  "UK": "United Kingdom",
  "US": "United States",
  "UM": "United States Minor Outlying Islands",
  "UY": "Uruguay",
  "UZ": "Uzbekistan",
  "VU": "Vanuatu",
  "VE": "Venezuela",
  "VN": "Viet Nam",
  "VG": "Virgin Islands, British",
  "VI": "Virgin Islands, U.s.",
  "WF": "Wallis and Futuna",
  "EH": "Western Sahara",
  "YE": "Yemen",
  "ZM": "Zambia",
  "ZW": "Zimbabwe"
};

router.get("/countries", (req, res) => {
  const { keywords } = req.query;

  let countries = [];
  const seenTitles = new Set();
  
  for (const [code, name] of Object.entries(COUNTRY_MAP)) {
    if (!seenTitles.has(name)) {
      seenTitles.add(name);
      countries.push({ id: code, title: name });
    }
  }

  if (keywords) {
    const lower = keywords.toLowerCase();
    countries = countries.filter(c => c.title.toLowerCase().includes(lower));
  }

  // Limit results
  res.json({ data: countries.slice(0, 50) });
});

// GET /search-ids/companies 
// This handles the Autocomplete for the Company Filter 
router.get("/companies", async (req, res) => { 
  try { 
    // 1. Extract the search term (Frontend sends 'keywords', API expects 'q') 
    const query = req.query.keywords || req.query.q || ""; 
 
    if (!query) { 
      return res.json({ data: [] }); 
    } 
 
    // Use the Middleware URL (port 3001) instead of the raw engine URL
    const MIDDLEWARE_URL = process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";

    console.log(`🔍 Auto-completing company: ${query}`);

    // Forward to the Middleware Service
    const response = await axios.get(`${MIDDLEWARE_URL}/search/companies/suggest`, {
      params: { q: query },
      headers: {
        'x-api-key': process.env.MAWSOOL_MIDDLEWARE_KEY
      },
      timeout: 5000
    }); 
 
    // 3. Map the data to the format expected by the frontend
    // The frontend expects: { items: [{ id, name, domain, label, value }, ...] }
    
    // Helper to proxy logo
    const proxyLogo = (logo, req) => {
        if (!logo || typeof logo !== 'string' || !logo.includes('images.contactout.com')) return logo;
        try {
            const encoded = Buffer.from(logo).toString('base64');
            const host = req.get('host');
            const protocol = req.protocol;
            return `${protocol}://${host}/api/proxy/image?key=${encoded}`;
        } catch (e) { return logo; }
    };

    const mappedData = (response.data || []).map(company => ({
      id: company.domain,       // Use domain as ID
      name: company.name,       // Display name
      title: company.name,      // AutoSuggestInput uses title or name
      domain: company.domain,
      label: company.name,      // User requested label
      value: company.domain,    // User requested value
      logo: proxyLogo(company.logo, req)
    }));

    // 4. Return the results to the frontend 
    // Wrapped in 'items' because ExCompanyFilter.jsx expects res.data.items
    res.json({ items: mappedData }); 

  } catch (error) { 
    console.error("❌ Company Autocomplete Error:", error.message); 
    // Return empty items array on error
    res.json({ items: [] }); 
  } 
});

// GET /search-ids/education
// This handles the Autocomplete for the Education/University Filter
router.get("/education", async (req, res) => {
  try {
    const query = req.query.keywords || req.query.q || "";

    if (!query) {
      return res.json({ items: [] });
    }

    const MIDDLEWARE_URL = process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
    const MIDDLEWARE_KEY = process.env.MAWSOOL_MIDDLEWARE_KEY || "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6";

    console.log(`🔍 Auto-completing education: ${query}`);

    const response = await axios.get(`${MIDDLEWARE_URL}/search/education/suggest`, {
      params: { q: query },
      headers: {
        'x-api-key': MIDDLEWARE_KEY
      },
      timeout: 5000
    });

    // Map the data
    const mappedData = (response.data || []).map(item => ({
      id: item.name,          // Use name as ID for simplicity
      name: item.name,
      title: item.name,
      label: item.name,
      value: item.name
    }));

    res.json({ items: mappedData });

  } catch (error) {
    console.error("❌ Education Autocomplete Error:", error.message);
    res.json({ items: [] });
  }
});

// GET /search-ids/cities
// This handles the Autocomplete for the City Filter
router.get("/cities", async (req, res) => {
  try {
    const query = req.query.keywords || req.query.q || "";

    if (!query) {
      return res.json({ data: [] });
    }

    const MIDDLEWARE_URL = process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
    const MIDDLEWARE_KEY = process.env.MAWSOOL_MIDDLEWARE_KEY || "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6";

    console.log(`🔍 Auto-completing city: ${query}`);

    const response = await axios.get(`${MIDDLEWARE_URL}/search/cities/suggest`, {
      params: { q: query, country: req.query.country },
      headers: {
        'x-api-key': MIDDLEWARE_KEY
      },
      timeout: 5000
    });

    // The middleware (which calls the engine) might return an array directly OR { data: [...] }
    // We need to safely extract the array of cities.
    const responseData = response.data;
    const citiesArray = Array.isArray(responseData) ? responseData : (responseData.data || []);

    // Map the data to the format expected by the frontend
    const mappedData = citiesArray.map(city => ({
      id: city.name,
      title: city.name,
      name: city.name,
      label: city.name,
      value: city.name
    }));

    res.json({ data: mappedData });

  } catch (error) {
    console.error("❌ City Autocomplete Error:", error.message);
    res.json({ data: [] });
  }
});

const JOB_FUNCTIONS = [
  "Operations",
  "Engineering",
  "Education",
  "Sales",
  "Healthcare Services",
  "Leadership",
  "Administrative",
  "Accounting",
  "Arts and Design",
  "Information Technology",
  "Entrepreneurship",
  "Customer Success and Support",
  "Finance",
  "Media and Communication",
  "Human Resources",
  "Program and Project Management",
  "Marketing",
  "Business Development",
  "Military and Protective Services",
  "Community and Social Services",
  "Research",
  "Legal",
  "Quality Assurance",
  "Consulting",
  "Purchasing",
  "Real Estate",
  "Product Management"
];

router.get("/functions", (req, res) => {
  const { keywords } = req.query;
  let functions = JOB_FUNCTIONS.map(f => ({ id: f, name: f }));

  if (keywords) {
    const lower = keywords.toLowerCase();
    functions = functions.filter(f => f.name.toLowerCase().includes(lower));
  }

  res.json({ data: functions });
});

router.get("/departments", (req, res) => {
  // Alias to functions if needed, or keep empty
  res.json({ data: [] });
});

router.get("/universities", (req, res) => {
  res.json({ data: [] });
});

module.exports = router;
