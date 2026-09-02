// auth/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const { upsertOAuthUser } = require('./upsertOAuthUser');
const User = require('../models/User'); // Required for serialize/deserialize

// --- Session Serialization (Legacy support) ---
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser((id, done) => {
  User.findById(id).then((user) => done(null, user));
});
// ----------------------------------------------

const API_BASE = process.env.API_BASE_URL; // e.g. https://api.example.com

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_REDIRECT_URI || `${API_BASE}/api/auth/google/callback`,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const { user, isNew } = await upsertOAuthUser("google", profile, req);
          return done(null, user, { isNew });
        } catch (e) {
          return done(e);
        }
      }
    )
  );
} else {
  console.warn("[auth] Google OAuth skipped (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set)");
}

if (process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET) {
  passport.use(
    new MicrosoftStrategy(
      {
        clientID: process.env.MS_CLIENT_ID,
        clientSecret: process.env.MS_CLIENT_SECRET,
        callbackURL: process.env.MS_REDIRECT_URI || `${API_BASE}/api/auth/microsoft/callback`,
        scope: ["user.read", "openid", "email", "profile"],
        tenant: "organizations",
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const { user, isNew } = await upsertOAuthUser("microsoft", profile, req);
          return done(null, user, { isNew });
        } catch (e) {
          return done(e);
        }
      }
    )
  );
} else {
  console.warn("[auth] Microsoft OAuth skipped (MS_CLIENT_ID / MS_CLIENT_SECRET not set)");
}

module.exports = passport;
