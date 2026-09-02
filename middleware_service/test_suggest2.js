const axios = require('axios');
async function test() {
    try {
        console.log("fetching...");
        const res = await axios.get("http://localhost:3000/search/companies/suggest?q=mawsool");
        console.log("data:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error("err:", e.response ? e.response.data : e.message);
    }
}
test();