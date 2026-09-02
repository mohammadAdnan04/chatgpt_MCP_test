const axios = require('axios');
require('dotenv').config();

async function test() {
    console.log("Testing search by company_name on Middleware...");
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
            headers: { 
                "Content-Type": "application/json",
                "x-api-key": process.env.MAWSOOL_MIDDLEWARE_KEY || "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6"
            }
        });
        console.log(`Results: ${res.data.items ? res.data.items.length : 0} items`);
        console.log(`Total: ${res.data.total}`);
    } catch (e) {
        console.error("Error payload:", e.response ? e.response.data : e.message);
    }
}
test();