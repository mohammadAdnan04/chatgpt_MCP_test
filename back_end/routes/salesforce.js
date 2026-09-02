const express = require('express');
const router = express.Router();
const jsforce = require('jsforce');
const User = require('../models/User');
const { isAuthenticated } = require('../middlewares/authMiddleware');

// Setup OAuth2 configuration
const oauth2 = new jsforce.OAuth2({
  clientId: process.env.SALESFORCE_CLIENT_ID,
  clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
  redirectUri: process.env.SALESFORCE_REDIRECT_URI
});

// 1. Connect Route (Initiate OAuth flow)
router.get('/connect', isAuthenticated, (req, res) => {
  // Use req.user.id or req.user.sub or fallback to req.userObj._id based on authMiddleware
  const userId = req.user?.id || req.user?.sub || req.userObj?._id;
  
  if (!userId) {
    return res.status(400).send('User ID not found in request');
  }

  // Pass the user ID as state so we know who is connecting when they return
  const authUrl = oauth2.getAuthorizationUrl({
    scope: 'api id web refresh_token offline_access',
    state: userId.toString()
  });
  res.redirect(authUrl);
});

// 2. Callback Route (Salesforce redirects here)
router.get('/callback', async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state;

  if (!code || !userId) {
    return res.status(400).send('Missing authorization code or state (user ID).');
  }

  try {
    const conn = new jsforce.Connection({ oauth2: oauth2 });
    await conn.authorize(code);

    // Save tokens to the user in the database
    await User.findByIdAndUpdate(userId, {
      'salesforce.accessToken': conn.accessToken,
      'salesforce.refreshToken': conn.refreshToken,
      'salesforce.instanceUrl': conn.instanceUrl
    });

    // Redirect the user back to the Integrations page on the frontend
    // Use the appropriate frontend URL depending on environment
    const frontendUrl = process.env.NODE_ENV === 'production' 
      ? 'https://mawsool.tech/integrations' 
      : 'http://localhost:3000/integrations';

    res.redirect(frontendUrl);
  } catch (error) {
    console.error('Salesforce OAuth Error:', error);
    res.status(500).send('Error during Salesforce authentication.');
  }
});

// 3. Status Route (Check if connected)
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isConnected = !!(user.salesforce && user.salesforce.refreshToken);
    res.json({ isConnected });
  } catch (error) {
    console.error('Error checking Salesforce status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Disconnect Route
router.post('/disconnect', isAuthenticated, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        'salesforce.accessToken': null,
        'salesforce.refreshToken': null,
        'salesforce.instanceUrl': null
      }
    });
    res.json({ message: 'Disconnected successfully', isConnected: false });
  } catch (error) {
    console.error('Error disconnecting from Salesforce:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
