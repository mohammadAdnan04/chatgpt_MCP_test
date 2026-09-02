const fs = require('fs');

const industries = [
  "Information Technology & Services", "Computer Software", "Hospital & Health Care", "Construction", "Accounting", "Oil & Energy", "Higher Education", "Retail", "Education Management", "Banking", "Marketing & Advertising", "Government Administration", "Hospitality", "Civil Engineering", "Food & Beverages", "Financial Services", "Automotive", "Telecommunications", "Architecture & Planning", "Electrical & Electronic Manufacturing", "Mechanical Or Industrial Engineering", "Management Consulting", "Food Production", "Real Estate", "Airlines/Aviation", "Internet", "Pharmaceuticals", "Transportation/Trucking/Railroad", "Human Resources", "Logistics & Supply Chain", "Chemicals", "Health, Wellness & Fitness", "Design", "Law Practice", "Medical Practice", "Research", "Insurance", "Apparel & Fashion", "Consumer Goods", "Textiles", "Non-profit Organization Management", "Machinery", "Utilities", "Primary/Secondary Education", "Leisure, Travel & Tourism", "Building Materials", "Graphic Design", "Staffing & Recruiting", "Computer & Network Security", "Sports", "E-learning", "Import & Export", "Computer Hardware", "Mining & Metals", "Restaurants", "International Trade & Development", "Industrial Automation", "Farming", "Arts & Crafts", "Furniture", "Medical Device", "Outsourcing/Offshoring", "Media Production", "Facilities Services", "Business Supplies & Equipment", "Public Relations & Communications", "Consumer Services", "Security & Investigations", "Wholesale", "Computer Networking", "Biotechnology", "Professional Training & Coaching", "Renewables & Environment", "Entertainment", "Aviation & Aerospace", "Consumer Electronics", "Maritime", "Translation & Localization", "Broadcast Media", "Defense & Space", "Cosmetics", "Legal Services", "Environmental Services", "Investment Management", "Market Research", "Events Services", "Fine Art", "Military", "Mental Health Care", "Publishing", "Writing & Editing", "Plastics", "Animation", "Alternative Medicine", "Individual & Family Services", "Photography", "Information Services", "Executive Office", "Printing"
];

const countries = [
  "Afghanistan", "Albania", "Algeria", "American Samoa", "Andorra", "Angola", "Anguilla", "Antarctica", "Antigua and Barbuda", "Argentina", "Armenia", "Aruba", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Belin", "Bermuda", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Bouvet Island", "Brazil", "British Indian Ocean Territory", "Brunei Darussalam", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Cayman Islands", "Central African Republic", "Chad", "Chile", "China", "Christmas Island", "Cocos (Keeling) Islands", "Colombia", "Comoros", "Congo", "Congo, Democratic Republic of the", "Cook Islands", "Costa Rica", "Cote D'Ivoire", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Falkland Islands (Malvinas)", "Faroe Islands", "Fiji", "Finland", "France", "French Guiana", "French Polynesia", "French Southern Territories", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Gibraltar", "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Heard Island and Mcdonald Islands", "Holy See (Vatican City State)", "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran, Islamic Republic of", "Iraq", "Ireland", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, Democratic People's Republic of", "Korea, Republic of", "Kuwait", "Kyrgyzstan", "Lao People's Democratic Republic", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libyan Arab Jamahiriya", "Liechtenstein", "Lithuania", "Luxembourg", "Macao", "Macedonia, The Former Yugoslav Republic of", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Martinique", "Mauritania", "Mauritius", "Mayotte", "Mexico", "Micronesia, Federated States of", "Moldova, Republic of", "Monaco", "Mongolia", "Montserrat", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "Netherlands Antilles", "New Caledonia", "New Zealand", "Nicaragua", "Niger", "Nigeria", "Niue", "Norfolk Island", "Northern Mariana Islands", "Norway", "Oman", "Pakistan", "Palau", "Palestinian Territory, Occupied", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Pitcairn", "Poland", "Portugal", "Puerto Rico", "Qatar", "Reunion", "Romania", "Russian Federation", "Rwanda", "Saint Helena", "Saint Kitts and Nevis", "Saint Lucia", "Saint Pierre and Miquelon", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia and Montenegro", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Georgia and the South Sandwich Islands", "Spain", "Sri Lanka", "Sudan", "Suriname", "Svalbard and Jan Mayen", "Swaziland", "Sweden", "Switzerland", "Syrian Arab Republic", "Taiwan, Province of China", "Tajikistan", "Tanzania, United Republic of", "Thailand", "Timor-Leste", "Togo", "Tokelau", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Turks and Caicos Islands", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "United States Minor Outlying Islands", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela", "Viet Nam", "Virgin Islands, British", "Virgin Islands, U.s.", "Wallis and Futuna", "Western Sahara", "Yemen", "Zambia", "Zimbabwe"
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

const rows = [["Filter Type", "Allowed Value"]];

const pushData = (filterType, arr) => {
  arr.forEach(val => {
    // Escape quotes and handle commas
    const safeValue = `"${(val || '').replace(/"/g, '""')}"`;
    rows.push([filterType, safeValue]);
  });
};

pushData("industry", industries);
pushData("location", countries);
pushData("seniority", seniorities);
pushData("function", functions);
pushData("language", languages);
pushData("company_headcount", companyHeadcount);

const csvContent = rows.map(r => r.join(',')).join('\n');
fs.writeFileSync('mawsool_api_allowed_filters.csv', csvContent, 'utf-8');

console.log("Successfully generated mawsool_api_allowed_filters.csv with", rows.length - 1, "values.");