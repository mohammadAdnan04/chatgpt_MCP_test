const service = require('./service');

// Mock axios
service.axiosInstance.post = async (url, payload) => {
  console.log("--- MOCKED API CALL ---");
  console.log("URL:", url);
  console.log("Payload:", JSON.stringify(payload, null, 2));
  return { data: { metadata: { total_results: 0 }, profiles: {} } };
};

async function test() {
  console.log("Test 1: Language as Array ['es']");
  try {
      await service.searchPeople({
        language: ["es"]
      }, 1);
  } catch (e) { console.error(e); }

  console.log("\nTest 2: Language as Object { include: ['es'] }");
  try {
      await service.searchPeople({
        language: { include: ["es"] }
      }, 1);
  } catch (e) { console.error(e); }
  
  console.log("\nTest 3: Language as 'Spanish' (full name)");
  try {
      await service.searchPeople({
        language: ["Spanish"]
      }, 1);
  } catch (e) { console.error(e); }
}

test();