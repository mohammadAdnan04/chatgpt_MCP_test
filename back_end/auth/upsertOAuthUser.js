// auth/upsertOAuthUser.js
const User = require('../models/User'); // adjust path if needed
const { validateBusinessEmail } = require('../utils/emailValidator');
const { fireAndForgetSignupSync } = require('../services/pipedriveService');

function getEmail(provider, profile) {
  const fromList = profile.emails?.[0]?.value;
  if (fromList) return fromList.toLowerCase();

  if (provider === 'microsoft') {
    const j = profile._json || {};
    return (j.mail || j.userPrincipalName || '').toLowerCase() || null;
  }
  return null;
}

function getName(profile) {
  return (
    profile.displayName ||
    [profile.name?.givenName, profile.name?.familyName].filter(Boolean).join(' ') ||
    ''
  );
}

function getAvatar(profile) {
  return profile.photos?.[0]?.value || '';
}

async function upsertOAuthUser(provider, profile, req = null) {
  const email = getEmail(provider, profile);

  // 1. UNIVERSAL EMAIL BLOCK: Validate email before ANY database interaction
  // This blocks both new signups AND existing users trying to log in with personal emails
  if (email) {
    const validation = await validateBusinessEmail(email);
    if (!validation.isValid) {
      throw new Error(validation.msg);
    }
  }

  const name = getName(profile);
  const avatar = getAvatar(profile);

  let signupIp = "";
  let signupUserAgent = "";
  let signupReferer = "";
  let signupUrl = "";

  if (req) {
    const getClientIp = (req) => {
      const cfIp = req.headers['cf-connecting-ip'];
      if (cfIp) return cfIp;
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) return forwarded.split(',')[0].trim();
      return req.ip || req.connection?.remoteAddress;
    };
    signupIp = getClientIp(req) || "";
    signupUserAgent = req.headers['user-agent'] || "";
    signupReferer = req.headers['referer'] || "";
    signupUrl = req.headers['origin'] || "";
  }

  // 1. Try finding by Google/Microsoft ID first
  let user = null;
  if (provider === 'google') {
    user = await User.findOne({ googleId: profile.id });
  } else if (provider === 'microsoft') {
    user = await User.findOne({ microsoftId: profile.id });
  }

  // 2. Fallback to finding by email if no ID match
  if (!user && email) {
    user = await User.findOne({ email });
  }

  let isNew = false;
  if (!user) {
    // --- Free Account Limit Check ---
    if (email) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (emailDomain && emailDomain !== "open.cx" && emailDomain !== "mnzil.com") {
        const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const domainRegex = new RegExp(`@${escapeRegex(emailDomain)}$`, 'i');
        const domainUsers = await User.find({ email: domainRegex }).populate('orgId', 'planKey');
        
        let freeAccountCount = 0;
        for (const u of domainUsers) {
          const planKey = String(u.planKey || u.orgId?.planKey || "FREE").toUpperCase();
          if (planKey === "FREE" && u.isVerified) {
            freeAccountCount++;
          }
        }

        const maxFreeAccounts = emailDomain === 'businessalliance.me' ? 4 : 3;
        if (freeAccountCount >= maxFreeAccounts) {
          throw new Error("You have exceeded the amount of free accounts per company, you need to subscribe now");
        }
      }
    }
    // --------------------------------

    // 3. Create new user
    try {
      user = await User.create({
        email,
        name,
        avatar,
        // assign defaults that your schema allows
        role: 'user',
        onboarded: false,
        isVerified: true,
        googleId: provider === 'google' ? profile.id : undefined,
        microsoftId: provider === 'microsoft' ? profile.id : undefined,
        tokenVersion: 0, // Initialize tokenVersion explicitly
        allowMultipleSessions: false, // Default to single session for new OAuth users
        signupIp,
        signupUserAgent,
        signupReferer,
        signupUrl
      });
      isNew = true;
      fireAndForgetSignupSync(user);
    } catch (error) {
      // 3a. Handle Race Condition (Duplicate Key Error)
      if (error.code === 11000) {
        console.warn(`[upsertOAuthUser] Race condition detected for ${email}. Fetching existing user.`);
        user = await User.findOne({ email });
        if (!user) throw error; // Should not happen if race condition was real
      } else {
        throw error;
      }
    }
  } else {
    // 4. Update existing user with ID if missing
    const updates = {};
    if (provider === 'google' && !user.googleId) updates.googleId = profile.id;
    if (provider === 'microsoft' && !user.microsoftId) updates.microsoftId = profile.id;

    // --- Single Session Logic for OAuth ---
    // If multiple sessions are NOT allowed, we must increment the token version.
    // This invalidates old tokens (from other devices).
    if (!user.allowMultipleSessions) {
      const now = Date.now();
      const lastUpdate = user.updatedAt ? new Date(user.updatedAt).getTime() : 0;
      const createdTime = user.createdAt ? new Date(user.createdAt).getTime() : 0;
      // Increased window to 1 minute to be absolutely safe against redirect loops
      const isRecent = (now - lastUpdate) < 60000 || (now - createdTime) < 60000; 
      
      console.log(`upsertOAuthUser Check: ID=${user._id}, isRecent=${isRecent}, createdTime=${createdTime}, lastUpdate=${lastUpdate}, now=${now}`);
      
      if (!isRecent) {
        const currentVersion = user.tokenVersion || 0;
        updates.tokenVersion = currentVersion + 1;
        // We must also update the local user object so the token issued uses the NEW version
        user.tokenVersion = updates.tokenVersion; 
        console.log(`Token version incremented to ${updates.tokenVersion}`);
      } else {
        console.log(`Token version NOT incremented (isRecent=true)`);
      }
    }
    // ---------------------------------------

    if (!user.name && name) updates.name = name;
    if (!user.avatar && avatar) updates.avatar = avatar;
    
    if (Object.keys(updates).length) {
      await User.updateOne({ _id: user._id }, { $set: updates });
    }
  }
  // console.log('upsertOAuthUser  - req.user:', { userId: user?._id, isNew });
  return { user, isNew };
}

module.exports = { upsertOAuthUser };
