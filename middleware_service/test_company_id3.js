const axios = require('axios');

async function test() {
    console.log("Testing search by company_linkedin_id (via exact match / new filter?) on LOCAL SEARCH ENGINE...");
    try {
        const payload3 = {
            "page": 1,
            "limit": 5,
            "filters": {
                "company_linkedin_id": ["81831244"] // inside filters
            }
        };
        const res3 = await axios.post("http://localhost:3000/search/people", payload3, {
            headers: { "Content-Type": "application/json" }
        });
        console.log(`Results with company_linkedin_id: ${res3.data.results ? res3.data.results.length : 0} items`);
        console.log(`Total: ${res3.data.total}`);
        if(res3.data.results && res3.data.results.length > 0) {
           console.log(`First item: ${res3.data.results[0].body.first_name} ${res3.data.results[0].body.last_name}`);
        }
    } catch (e) {
        console.error("Error payload3:", e.response ? e.response.data : e.message);
    }
}
test();
