const axios = require('axios');

async function testLimit() {
  const url = 'http://localhost:3001/search';
  const apiKey = 'mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6'; // from your local config

  try {
    // 1. Test MENA Search (Mawsool Engine)
    console.log("Testing MENA Search (limit 50)...");
    const menaRes = await axios.post(url, {
      filters: { location: { include: ["Saudi Arabia"] } },
      limit: 50
    }, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
    });
    console.log("MENA returned items:", menaRes.data.items?.length);
    console.log("MENA paging info:", menaRes.data.paging);

    // 2. Test GLOBAL Search (ContactOut via Cache)
    console.log("\nTesting GLOBAL Search (limit 50)...");
    const globalRes = await axios.post(url, {
      filters: { location: { include: ["United States"] } },
      limit: 50
    }, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
    });
    console.log("GLOBAL returned items:", globalRes.data.items?.length);
    console.log("GLOBAL paging info:", globalRes.data.paging);
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}

testLimit();
