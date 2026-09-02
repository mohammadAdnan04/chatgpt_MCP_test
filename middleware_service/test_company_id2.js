const axios = require('axios');

async function test() {
    console.log("Testing search by company_linkedin_id (via exact match / new filter?)...");
    try {
        const payload3 = {
            "page": 1,
            "limit": 5,
            "company_linkedin_id": ["81831244"], // at root level
            "filters": {
                "company_linkedin_id": ["81831244"] // inside filters
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
