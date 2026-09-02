const { Country } = require('country-state-city');

const allCountries = Country.getAllCountries();

function test(countryName) {
  let searchName = countryName.toLowerCase();
  
  if (searchName === "saudi arabia") searchName = "saudi arabia";
  if (searchName === "united arab emirates" || searchName === "uae") searchName = "united arab emirates";

  const countryObj = allCountries.find(c => {
    const libName = c.name.toLowerCase();
    const libIso = c.isoCode.toLowerCase();
    
    return libName === searchName || 
           libIso === searchName || 
           (searchName.length > 3 && libName.includes(searchName));
  });

  console.log(`Input: ${countryName} -> Found:`, countryObj ? countryObj.name : "NOT FOUND");
}

test("United Arab Emirates");
test("Saudi Arabia");
test("Jordan");
test("UAE");
test("Arab");