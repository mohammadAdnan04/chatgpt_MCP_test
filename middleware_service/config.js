
// Valid options extracted from CSV and API Docs

const CONTACTOUT_INDUSTRIES = [
  "Defense & Space", "Computer Hardware", "Computer Software", "Computer Networking", 
  "Internet", "Semiconductors", "Telecommunications", "Law Practice", "Legal Services", 
  "Management Consulting", "Biotechnology", "Medical Practice", "Hospital & Health Care", 
  "Pharmaceuticals", "Veterinary", "Medical Device", "Cosmetics", "Apparel & Fashion", 
  "Sporting Goods", "Tobacco", "Supermarkets", "Food Production", "Consumer Electronics", 
  "Consumer Goods", "Furniture", "Retail", "Entertainment", "Gambling & Casinos", 
  "Leisure, Travel & Tourism", "Hospitality", "Restaurants", "Sports", "Food & Beverages", 
  "Motion Pictures & Film", "Broadcast Media", "Museums & Institutions", "Fine Art", 
  "Performing Arts", "Recreational Facilities & Services", "Banking", "Insurance", 
  "Financial Services", "Real Estate", "Investment Banking", "Investment Management", 
  "Accounting", "Construction", "Building Materials", "Architecture & Planning", 
  "Civil Engineering", "Aviation & Aerospace", "Automotive", "Chemicals", "Machinery", 
  "Mining & Metals", "Oil & Energy", "Shipbuilding", "Utilities", "Textiles", 
  "Paper & Forest Products", "Railroad Manufacture", "Farming", "Ranching", "Dairy", 
  "Fishery", "Primary/Secondary Education", "Higher Education", "Education Management", 
  "Research", "Military", "Legislative Office", "Judiciary", "International Affairs", 
  "Government Administration", "Executive Office", "Law Enforcement", "Public Safety", 
  "Public Policy", "Marketing & Advertising", "Newspapers", "Publishing", "Printing", 
  "Information Services", "Libraries", "Environmental Services", "Package/Freight Delivery", 
  "Individual & Family Services", "Religious Institutions", "Civic & Social Organization", 
  "Consumer Services", "Transportation/Trucking/Railroad", "Warehousing", "Airlines/Aviation", 
  "Maritime", "Information Technology & Services", "Market Research", "Public Relations & Communications", 
  "Design", "Non-profit Organization Management", "Fundraising", "Program Development", 
  "Writing & Editing", "Staffing & Recruiting", "Professional Training & Coaching", 
  "Venture Capital & Private Equity", "Political Organization", "Translation & Localization", 
  "Computer Games", "Events Services", "Arts & Crafts", "Electrical & Electronic Manufacturing", 
  "Online Media", "Nanotechnology", "Music", "Logistics & Supply Chain", "Plastics", 
  "Computer & Network Security", "Wireless", "Alternative Dispute Resolution", 
  "Security & Investigations", "Facilities Services", "Outsourcing/Offshoring", 
  "Health, Wellness & Fitness", "Alternative Medicine", "Media Production", "Animation", 
  "Commercial Real Estate", "Capital Markets", "Think Tanks", "Philanthropy", "E-learning", 
  "Wholesale", "Import & Export", "Mechanical Or Industrial Engineering", "Photography", 
  "Human Resources", "Business Supplies & Equipment", "Mental Health Care", "Graphic Design", 
  "International Trade & Development", "Wine & Spirits", "Luxury Goods & Jewelry", 
  "Renewables & Environment", "Glass, Ceramics & Concrete", "Packaging & Containers", 
  "Industrial Automation", "Government Relations"
];

// Map 2-letter country codes to Full Names (ContactOut expects full names or specific variations)
const COUNTRY_MAP = {
  "US": "United States",
  "UK": "United Kingdom",
  "GB": "United Kingdom",
  "AE": "United Arab Emirates",
  "SA": "Saudi Arabia",
  "CA": "Canada",
  "AU": "Australia",
  "DE": "Germany",
  "FR": "France",
  "IN": "India",
  "CN": "China",
  // Add more common ones or use a library if needed, but for now this covers major markets
};

// Valid Experience Buckets
const EXPERIENCE_BUCKETS = ["0_1", "1_2", "3_5", "6_10", "10"];

// Valid Company Size Buckets
const SIZE_BUCKETS = ["1_10", "11_50", "51_200", "201_500", "501_1000", "1001_5000", "5001_10000", "10001"];

module.exports = {
  CONTACTOUT_INDUSTRIES,
  COUNTRY_MAP,
  EXPERIENCE_BUCKETS,
  SIZE_BUCKETS
};
