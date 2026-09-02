// scripts/seedAdmin.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Admin credentials - either from command line or defaults
const email = process.argv[2] || process.env.ADMIN_MAIL || 'admin@example.com';
const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'Admin@123456';
const name = process.argv[4] || process.env.ADMIN_NAME || 'System Administrator';

async function seedAdmin() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // STEP 1: Remove all existing admin users
    const result = await User.updateMany(
      { role: 'admin' },
      { $set: { role: 'user' } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`Removed admin privileges from ${result.modifiedCount} existing admin users`);
    } else {
      console.log('No existing admin users found');
    }

    // STEP 2: Check if the target user exists
    let adminUser = await User.findOne({ email });
    
    if (adminUser) {
      // Update existing user
      console.log(`User with email ${email} found. Setting as admin...`);
      adminUser.role = 'admin';
      
      // Optionally update other fields
      adminUser.name = name;
      // Only update password if provided as command line argument
      if (process.argv[3]) {
        const salt = await bcrypt.genSalt(10);
        adminUser.password = await bcrypt.hash(password, salt);
      }
      
      await adminUser.save();
      console.log('User updated to admin successfully');
    } else {
      // Create new admin user
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create admin user
      adminUser = new User({
        name,
        email,
        password: hashedPassword,
        role: 'admin',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
        credits: 1000, // Give admin plenty of credits
      });

      await adminUser.save();
      console.log('New admin user created successfully');
    }
    
    // Show the admin user details
    console.log('\nAdmin details:');
    console.log(`- Email: ${adminUser.email}`);
    console.log(`- Name: ${adminUser.name}`);
    console.log(`- Role: ${adminUser.role}`);
    console.log(`- Password: ${adminUser.password}`);
    console.log(`- ID: ${adminUser._id}`);
    console.log('\nYou can now login with these credentials.');

  } catch (error) {
    console.error('Error seeding admin:', error);
  } finally {
    // Close database connection
    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the function
seedAdmin();