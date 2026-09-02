const axios = require('axios');

async function test() {
    // 1. First test: search by name
    console.log("Testing search by company_name...");
    try {
        const payload1 = {
            "page": 1,
            "limit": 5,
            "filters": {
                "company_name": ["Mawsool International|||mawsool.tech"]
            }
        };
        const res1 = await axios.post("https://menasearch.mawsool.tech/search/people", payload1, {
            headers: { "Content-Type": "application/json" }
        });
        console.log(`Results with company_name: ${res1.data.results ? res1.data.results.length : 0} items`);
        console.log(`Total: ${res1.data.total}`);
    } catch (e) {
        console.error("Error payload1:", e.message);
    }

    // 2. Second test: search by company_id (linkedin_id: 81831244 or mawsool-id)
    console.log("\nTesting search by company_id...");
    try {
        const payload2 = {
            "page": 1,
            "limit": 5,
            "filters": {
                "company_id": ["81831244"] // linkedin_id from mawsool elastic v6
            }
        };
        const res2 = await axios.post("https://menasearch.mawsool.tech/search/people", payload2, {
            headers: { "Content-Type": "application/json" }
        });
        console.log(`Results with company_id: ${res2.data.results ? res2.data.results.length : 0} items`);
        console.log(`Total: ${res2.data.total}`);
    } catch (e) {
        console.error("Error payload2:", e.message);
    }
    
    // 3. Third test: search by company_linkedin_id
    console.log("\nTesting search by company_linkedin_id...");
    try {
        const payload3 = {
            "page": 1,
            "limit": 5,
            "filters": {
                "company_linkedin_id": ["81831244"]
            }
        };
        const res3 = await axios.post("https://menasearch.mawsool.tech/search/people", payload3, {
            headers: { "Content-Type": "application/json" }
        });
        console.log(`Results with company_linkedin_id: ${res3.data.results ? res3.data.results.length : 0} items`);
        console.log(`Total: ${res3.data.total}`);
    } catch (e) {
        console.error("Error payload3:", e.message);
    }
}
test();
