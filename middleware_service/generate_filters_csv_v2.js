const fs = require('fs');

const industries = [
  "Information Technology & Services", "Computer Software", "Hospital & Health Care", "Construction", "Accounting", "Oil & Energy", "Higher Education", "Retail", "Education Management", "Banking", "Marketing & Advertising", "Government Administration", "Hospitality", "Civil Engineering", "Food & Beverages", "Financial Services", "Automotive", "Telecommunications", "Architecture & Planning", "Electrical & Electronic Manufacturing", "Mechanical Or Industrial Engineering", "Management Consulting", "Food Production", "Real Estate", "Airlines/Aviation", "Internet", "Pharmaceuticals", "Transportation/Trucking/Railroad", "Human Resources", "Logistics & Supply Chain", "Chemicals", "Health, Wellness & Fitness", "Design", "Law Practice", "Medical Practice", "Research", "Insurance", "Apparel & Fashion", "Consumer Goods", "Textiles", "Non-profit Organization Management", "Machinery", "Utilities", "Primary/Secondary Education", "Leisure, Travel & Tourism", "Building Materials", "Graphic Design", "Staffing & Recruiting", "Computer & Network Security", "Sports", "E-learning", "Import & Export", "Computer Hardware", "Mining & Metals", "Restaurants", "International Trade & Development", "Industrial Automation", "Farming", "Arts & Crafts", "Furniture", "Medical Device", "Outsourcing/Offshoring", "Media Production", "Facilities Services", "Business Supplies & Equipment", "Public Relations & Communications", "Consumer Services", "Security & Investigations", "Wholesale", "Computer Networking", "Biotechnology", "Professional Training & Coaching", "Renewables & Environment", "Entertainment", "Aviation & Aerospace", "Consumer Electronics", "Maritime", "Translation & Localization", "Broadcast Media", "Defense & Space", "Cosmetics", "Legal Services", "Environmental Services", "Investment Management", "Market Research", "Events Services", "Fine Art", "Military", "Mental Health Care", "Publishing", "Writing & Editing", "Plastics", "Animation", "Alternative Medicine", "Individual & Family Services", "Photography", "Glass, Ceramics & Concrete", "Think Tanks", "Civic & Social Organization", "Luxury Goods & Jewelry", "Motion Pictures & Film", "Political Organization", "Veterinary", "Philanthropy", "Fundraising", "Executive Office", "Packaging & Containers", "Supermarkets", "Capital Markets", "Music", "Venture Capital & Private Equity", "Newspapers", "Online Media", "Sporting Goods", "Religious Institutions", "Information Services", "Program Development", "Law Enforcement", "Architecture and Planning", "Legislative Office", "Public Policy", "International Affairs", "Museums & Institutions", "Alternative Dispute Resolution", "Public Safety", "Warehousing", "Judiciary", "Dairy", "Ranching", "Printing", "Nanotechnology", "Libraries", "Investment Banking", "Commercial Real Estate", "Performing Arts", "Recreational Facilities & Services", "Shipbuilding", "Paper & Forest Products", "Railroad Manufacture", "Government Relations", "Fishery", "Tobacco"
];

const countries = [
  "Afghanistan", "Albania", "Algeria", "American Samoa", "Andorra", "Angola", "Anguilla", "Antarctica", "Antigua and Barbuda", "Argentina", "Armenia", "Aruba", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bermuda", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Bouvet Island", "Brazil", "British Indian Ocean Territory", "Brunei Darussalam", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Cayman Islands", "Central African Republic", "Chad", "Chile", "China", "Christmas Island", "Cocos (Keeling) Islands", "Colombia", "Comoros", "Congo", "Congo, Democratic Republic of the", "Cook Islands", "Costa Rica", "Cote D'Ivoire", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Falkland Islands (Malvinas)", "Faroe Islands", "Fiji", "Finland", "France", "French Guiana", "French Polynesia", "French Southern Territories", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Gibraltar", "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Heard Island and Mcdonald Islands", "Holy See (Vatican City State)", "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran, Islamic Republic of", "Iraq", "Ireland", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, Democratic People's Republic of", "Korea, Republic of", "Kuwait", "Kyrgyzstan", "Lao People's Democratic Republic", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libyan Arab Jamahiriya", "Liechtenstein", "Lithuania", "Luxembourg", "Macao", "Macedonia, The Former Yugoslav Republic of", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Martinique", "Mauritania", "Mauritius", "Mayotte", "Mexico", "Micronesia, Federated States of", "Moldova, Republic of", "Monaco", "Mongolia", "Montenegro", "Montserrat", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "Netherlands Antilles", "New Caledonia", "New Zealand", "Nicaragua", "Niger", "Nigeria", "Niue", "Norfolk Island", "Northern Mariana Islands", "Norway", "Oman", "Pakistan", "Palau", "Palestinian Territory, Occupied", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Pitcairn", "Poland", "Portugal", "Puerto Rico", "Qatar", "Reunion", "Romania", "Russian Federation", "Rwanda", "Saint Helena", "Saint Kitts and Nevis", "Saint Lucia", "Saint Pierre and Miquelon", "Saint Vincent and The Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Georgia and The South Sandwich Islands", "Spain", "Sri Lanka", "Sudan", "Suriname", "Svalbard and Jan Mayen", "Swaziland", "Sweden", "Switzerland", "Syrian Arab Republic", "Taiwan, Province of China", "Tajikistan", "Tanzania, United Republic of", "Thailand", "Timor-Leste", "Togo", "Tokelau", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Turks and Caicos Islands", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "United States Minor Outlying Islands", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela", "Viet Nam", "Virgin Islands, British", "Virgin Islands, U.S.", "Wallis and Futuna", "Western Sahara", "Yemen", "Zambia", "Zimbabwe"
];

const seniorities = [
  "Owner / Founder", "CXO", "Partner", "VP", "Head", "Director", "Manager", "Senior", "Entry", "Intern"
];

const functions = [
  "Operations", "Business Development", "Sales", "Education", "Engineering", "Healthcare Services", "Information Technology", "Administrative", "Arts and Design", "Customer Success and Support", "Finance", "Community and Social Services", "Media and Communication", "Accounting", "Marketing", "Human Resources", "Research", "Program and Project Management", "Legal", "Military and Protective Services", "Consulting", "Entrepreneurship", "Real Estate", "Quality Assurance", "Purchasing", "Product Management", "Leadership"
];

const languages = [
  "english", "spanish", "french", "german", "italian", "portuguese", "russian", "chinese", "japanese", "korean", "arabic", "hindi", "bengali", "punjabi", "javanese", "telugu", "vietnamese", "marathi", "turkish", "dutch", "polish", "swedish", "finnish", "danish", "norwegian", "greek", "hebrew", "indonesian", "malay", "thai"
];

const companyHeadcount = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"
];

const revenues = [
  { id: "0-1000000", title: "$0 - $1M" },
  { id: "1000000-10000000", title: "$1M - $10M" },
  { id: "10000000-50000000", title: "$10M - $50M" },
  { id: "50000000-100000000", title: "$50M - $100M" },
  { id: "100000000-500000000", title: "$100M - $500M" },
  { id: "500000000-1000000000", title: "$500M - $1B" },
  { id: "1000000000+", title: "$1B+" }
];

const foundedYears = [
  { id: "2020-2025", title: "2020-2025" },
  { id: "2010-2020", title: "2010-2020" },
  { id: "2000-2010", title: "2000-2010" },
  { id: "1990-2000", title: "1990-2000" },
  { id: "0-1990", title: "Before 1990" }
];

const yearsOfExperience = [
  { id: "Less than 1 year", title: "Less than 1 year" },
  { id: "1 to 2 years", title: "1 to 2 years" },
  { id: "3 to 5 years", title: "3 to 5 years" },
  { id: "6 to 10 years", title: "6 to 10 years" },
  { id: "More than 10 years", title: "More than 10 years" }
];

// Define columns mapping
const columnsData = [
  { header: "Accepted Industries values", data: industries.map(i => [i]) },
  { header: "Accepted Company Size values", data: companyHeadcount.map(c => [c]) },
  { header: "", data: [] },
  { header: "Accepted Years of Experience values", data: yearsOfExperience.map(y => [y.id, y.title]), subHeaders: ["Value", "Description"] },
  { header: "", data: [] },
  { header: "Accepted Years in Current Role", data: yearsOfExperience.map(y => [y.id, y.title]), subHeaders: ["Value", "Description"] },
  { header: "", data: [] },
  { header: "Accepted Seniorities", data: seniorities.map(s => [s]) },
  { header: "", data: [] },
  { header: "Accepted Job Functions", data: functions.map(f => [f]) },
  { header: "", data: [] },
  { header: "Accepted Languages", data: languages.map(l => [l]) },
  { header: "", data: [] },
  { header: "Accepted Revenue values", data: revenues.map(r => [r.id, r.title]), subHeaders: ["Value", "Description"] },
  { header: "", data: [] },
  { header: "Accepted Founded Year values", data: foundedYears.map(y => [y.id, y.title]), subHeaders: ["Value", "Description"] },
  { header: "", data: [] },
  { header: "Accepted Countries", data: countries.map(c => [c]) }
];

// Helper to escape CSV
const escapeCSV = (val) => {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// Compute max rows
let maxRows = 0;
columnsData.forEach(col => {
  if (col.data.length > maxRows) maxRows = col.data.length;
});

let csvLines = [];

// Header row
let headerRow = [];
columnsData.forEach(col => {
  headerRow.push(escapeCSV(col.header));
  if (col.subHeaders) {
    headerRow.push(escapeCSV(col.subHeaders[1] === "Description" ? "Description" : ""));
  }
});
csvLines.push(headerRow.join(','));

// Data rows
for (let i = 0; i < maxRows; i++) {
  let row = [];
  columnsData.forEach(col => {
    if (i < col.data.length) {
      row.push(escapeCSV(col.data[i][0]));
      if (col.subHeaders) {
         row.push(escapeCSV(col.data[i][1] || ""));
      }
    } else {
      row.push("");
      if (col.subHeaders) row.push("");
    }
  });
  csvLines.push(row.join(','));
}

fs.writeFileSync('mawsool_api_allowed_filters_formatted.csv', csvLines.join('\n'), 'utf-8');
console.log("Successfully generated mawsool_api_allowed_filters_formatted.csv");
