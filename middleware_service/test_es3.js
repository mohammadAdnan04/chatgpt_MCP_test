const axios = require('./node_modules/axios');

async function test() {
    const payload = {
        "page": 1,
        "limit": 10,
        "filters": {
            "company_name": ["Kaitamin|||kaitamin.com"]
        }
    };
    
    try {
        const response = await axios.post("https://menasearch.mawsool.tech/search/people", payload, {
            headers: { "Content-Type": "application/json" }
        });
        
        const osama = response.data.results.find(r => (r.body?.first_name === "Osama" && r.body?.last_name === "Abdelhadi") || (r.first_name === "Osama"));
        if (osama) {
            const body = osama.body || osama;
            console.log("Current Roles:");
            console.log(JSON.stringify(body.current_roles, null, 2));
            console.log("Company domains:");
            console.log(JSON.stringify(body.company_domain, null, 2));
        } else {
            console.log("Osama not found in first 10 results.");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();