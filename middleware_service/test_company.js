const axios = require('axios');
require('dotenv').config({ path: './.env' });

async function test() {
  const url = 'http://localhost:3001/search';
  const key = process.env.MAWSOOL_MIDDLEWARE_KEY;

  try {
    const res1 = await axios.post(url, {
      filters: {
        first_name: "khaled",
        last_name: "saghir",
        company: { include: ["Mawsool International|||mawsool.tech"] },
        location: { include: ["JO", "SA", "KW", "AE", "QA", "SY", "TN", "TR", "YE", "OM", "EG", "LY", "DZ", "MA"] }
      },
      page: 1,
      limit: 10,
      type: "people"
    }, { headers: { 'x-api-key': key } });
    console.log("With ||| =>", res1.data.paging?.total_count || res1.data.total);
  } catch (e) {
    console.log("Error 1", e.message, e.response?.data);
  }

  try {
    const res2 = await axios.post(url, {
      filters: {
        first_name: "khaled",
        last_name: "saghir",
        company: { include: ["mawsool.tech"] },
        location: { include: ["JO", "SA", "KW", "AE", "QA", "SY", "TN", "TR", "YE", "OM", "EG", "LY", "DZ", "MA"] }
      },
      page: 1,
      limit: 10,
      type: "people"
    }, { headers: { 'x-api-key': key } });
    console.log("Without ||| =>", res2.data.paging?.total_count || res2.data.total);
  } catch (e) {
    console.log("Error 2", e.message, e.response?.data);
  }
}

test();