const axios = require('axios');

async function test() {
    console.log("Testing search by company_name (Aramco) on Middleware...");
    try {
        const payload = {
            "page": 1,
            "limit": 5,
            "type": "companies",
            "filters": {
                "company_name": {"include": ["mawsool-موصول|||mawsool-موصول"]}
            }
        };
        const res = await axios.post("http://localhost:3001/search", payload, {
            headers: { "Content-Type": "application/json" }
        });
        console.log(`Results: ${res.data.results ? res.data.results.length : 0} items`);
        console.log(`Total: ${res.data.total}`);
    } catch (e) {
        console.error("Error payload:", e.response ? e.response.data : e.message);
    }
}
test();