
const axios = require('axios');

async function testSearch() {
    try {
        console.log("Sending search request for 'Najm' in Saudi Arabia...");
        const response = await axios.post('http://localhost:3001/search', {
            type: "people",
            filters: {
                keywords: "Najm",
                location: ["Saudi Arabia"]
            },
            page: 1,
            limit: 20
        });
        console.log("Response Status:", response.status);
        
        if (response.data && response.data.items) {
            console.log(`Received ${response.data.items.length} items.`);
            
            // Check for logo.dev usage
            const logoDevItems = response.data.items.filter(item => item.logo && item.logo.includes('logo.dev'));
            
            if (logoDevItems.length > 0) {
                console.log(`Found ${logoDevItems.length} items using logo.dev fallback.`);
                console.log("Example:", logoDevItems[0].name, logoDevItems[0].logo);
            } else {
                console.log("No items using logo.dev fallback found in this batch.");
            }
            
            // Log the first item's logo for verification
            if (response.data.items.length > 0) {
                 console.log("First Item Logo:", response.data.items[0].logo);
            }

        } else {
            console.log("No items returned.");
        }

    } catch (error) {
        console.error("Search failed:", error.message);
        if (error.response) {
            console.error("Data:", error.response.data);
        }
    }
}

testSearch();
