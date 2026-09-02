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
            console.log("Osama found!");
            console.log("Root Website:", body.website || body.company_domain);
            console.log("Experience Array:");
            body.experience.forEach(exp => {
                console.log(`- Company: ${exp.company?.name || exp.companyName}, Domain: ${exp.company?.domain || exp.company?.website}`);
            });
        } else {
            console.log("Osama not found in first 10 results.");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();