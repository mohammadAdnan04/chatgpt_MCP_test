const axios = require('axios');
async function test() {
    try {
        const res = await axios.get("http://localhost:3001/search/companies/suggest?q=mawsool");
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();