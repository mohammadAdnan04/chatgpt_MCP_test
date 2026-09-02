const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const User = require("../models/User");

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser((id, done) => {
  User.findById(id).then((user) => done(null, user));
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_REDIRECT_URI, // fine for local Google
}, async (accessToken, refreshToken, profile, done) => {
  let user = await User.findOne({ googleId: profile.id });
  if (!user) {
    user = await User.create({
      name: profile.displayName,
      email: profile.emails[0].value,
      googleId: profile.id,
      avatar: profile._json.picture,
    });
  }
  done(null, user);
}));

passport.use(new MicrosoftStrategy({
  clientID: process.env.MS_CLIENT_ID,
  clientSecret: process.env.MS_CLIENT_SECRET,
  callbackURL: process.env.MS_REDIRECT_URI,
  scope: ['user.read', 'openid', 'email', 'profile'],
  tenant: 'common',
  authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ microsoftId: profile.id });
     const name =
        profile?.displayName ||
        profile?.name?.givenName ||
        profile?.name?.familyName ||
        'Microsoft User';
    if (!user) {
      user = await User.create({
        name: name,
        email: profile.emails[0].value,
        microsoftId: profile.id,
        avatar: `${process.env.DEFAULT_AVATAR}${name}`,
      });
    }

    done(null, user);
  } catch (err) {
    done(err, null);
  }
}));
