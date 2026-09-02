require("dotenv").config(); // Load environment variables
const mongoose = require("mongoose");
const KnownField = require("../models/KnownField"); // Adjust path if needed

// MongoDB connection string with fallback
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/mawsool";

// Function to seed known fields
async function seedKnownFields() {
  const initialFields = [
    "industry",
    "name",
    "public_identifier",
    "linkedin_url",
    "public_profile_url",
    "profile_url",
    "profile_picture_url",
    "profile_picture_url_large",
    "network_distance",
    "location",
    "headline",
    "current_positions",
    "email",
    "phone",
    "status",
  ];

  try {
    for (const field of initialFields) {
      await KnownField.findOneAndUpdate(
        { name: field },
        { name: field },
        { upsert: true }
      );
      console.log(`Seeded field: ${field}`);
    }
    console.log("Seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding known fields:", error);
    throw error; // Rethrow to be caught in runSeed
  }
}

// Main function to connect to MongoDB and seed
async function runSeed() {
  try {
    // Validate MONGO_URI
    if (!mongoUri) {
      throw new Error("MONGO_URI is not defined in environment variables or .env file");
    }

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    // Run the seeding function
    await seedKnownFields();

    // Close the connection
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
    process.exit(0); // Exit with success
  } catch (error) {
    console.error("Seed script failed:", error);
    process.exit(1); // Exit with failure
  }
}

// Execute the script
runSeed();