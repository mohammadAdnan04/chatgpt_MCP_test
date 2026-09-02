
const service = require('./service');

const filters = {
  experience_at_role: ["1 to 2 years"]
};

// Mock mapYearsInCurrentRole to test it in isolation if needed, 
// but better to test the service's actual method if accessible.
// Since it's inside the class, we can call it via service instance.

console.log("Input:", filters.experience_at_role);
const mapped = service.mapYearsInCurrentRole(filters.experience_at_role);
console.log("Mapped:", mapped);

const payload = {
    years_in_current_role: mapped
};
console.log("Payload Part:", payload);
