
const axios = require('axios');

async function testSearch() {
    try {
        console.log("Sending search request for 'Najm'...");
        const response = await axios.post('http://localhost:3001/search', {
            type: "people",
            filters: {
                keywords: "Najm",
                location: ["Saudi Arabia"]
            },
            page: 1,
            limit: 50
        }, {
            headers: {
                'x-api-key': 'mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6'
            }
        });
        console.log("Response Status:", response.status);
        console.log("Returned Items:", response.data.items.length);
    } catch (error) {
        console.error("Search failed:", error.message);
    }
}

testSearch();
