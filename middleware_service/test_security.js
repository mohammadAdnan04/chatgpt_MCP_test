
const axios = require('axios');

const API_KEY_INTERNAL = "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6";
const API_KEY_EXTERNAL = "mawsool_ext_50df58aba58d8577c1fe76fad3bbf450";
const BASE_URL = "http://localhost:3001";

async function runTests() {
  console.log("🚀 Starting Middleware API Security & Routing Tests...\n");

  // --- TEST 1: NO API KEY (Should Fail) ---
  console.log("Test 1: Request without API Key (Expected Fail)");
  try {
    await axios.post(`${BASE_URL}/search`, { filters: {} });
  } catch (e) {
    console.log(`✅ Result: Got ${e.response.status} - ${e.response.data.error}\n`);
  }

  // --- TEST 2: MENA SEARCH (Internal Key) ---
  console.log("Test 2: MENA Search (Internal Key - simulating site)");
  try {
    const res = await axios.post(`${BASE_URL}/search`, {
      filters: { location: { include: ["Saudi Arabia"] } },
      type: "people"
    }, { headers: { 'x-api-key': API_KEY_INTERNAL } });
    
    const source = res.data.items?.[0]?._source;
    console.log(`✅ Result: Found ${res.data.items?.length} items. First source: ${source}`);
    if (source === 'MENA') console.log("   (Source label is correctly 'MENA')\n");
  } catch (e) {
    console.log(`❌ Result: Failed - ${e.message}\n`);
  }

  // --- TEST 3: GLOBAL SEARCH (External Key) ---
  console.log("Test 3: GLOBAL Search (External Key - simulating customer)");
  try {
    const res = await axios.post(`${BASE_URL}/search`, {
      filters: { location: { include: ["United States"] } },
      type: "people"
    }, { headers: { 'x-api-key': API_KEY_EXTERNAL } });
    
    const source = res.data.items?.[0]?._source;
    console.log(`✅ Result: Found ${res.data.items?.length} items. First source: ${source}`);
    if (source === 'Global') console.log("   (Source label is correctly 'Global')\n");
  } catch (e) {
    console.log(`❌ Result: Failed - ${e.message}\n`);
  }

  // --- TEST 4: COMPANY SEARCH (FORCED MENA) ---
  console.log("Test 4: Company Search (Forcing MENA as requested)");
  try {
    const res = await axios.post(`${BASE_URL}/search`, {
      filters: { keywords: "Aramco" },
      type: "companies"
    }, { headers: { 'x-api-key': API_KEY_INTERNAL } });
    
    const source = res.data.items?.[0]?._source;
    console.log(`✅ Result: Found ${res.data.items?.length} items. First source: ${source}`);
    if (source === 'MENA') console.log("   (Company search is correctly forced to 'MENA')\n");
  } catch (e) {
    console.log(`❌ Result: Failed - ${e.message}\n`);
  }
}

runTests();
