require("dotenv").config();
const hybridService = require("./hybridService");

async function testSearch() {
  try {
    const filters = { function: { include: ["Program and Project Management"] } };

    console.log("Testing full hybrid search:");
    let res = await hybridService.searchPeople(filters, 1, 10);
    console.log("Total:", res.total);
    console.log("Items:", res.items.length);

  } catch (error) {
    console.error("Error:", error);
  }
}

testSearch();