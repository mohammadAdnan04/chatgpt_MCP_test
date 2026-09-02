const fs = require('fs');
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const users = await User.find({
      isArchived: false,
      isVerified: { $ne: true },
      googleId: { $exists: false },
      microsoftId: { $exists: false }
    }, 'name email createdAt').lean();

    let csv = 'Name,Email,Created At\n';
    users.forEach(u => {
      csv += `"${u.name || ''}","${u.email || ''}","${u.createdAt || ''}"\n`;
    });

    fs.writeFileSync('unverified_users_export.csv', csv);
    console.log('Exported ' + users.length + ' users to unverified_users_export.csv');
    process.exit(0);
  })
  .catch(console.error);
