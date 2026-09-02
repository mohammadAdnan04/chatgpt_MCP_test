const jwt = require('jsonwebtoken');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Helper to get options based on environment
const getCookieOptions = (req) => {
  // Check if we are running on the server (Coolify) or Locally
  // MAKE SURE 'NODE_ENV=production' is set in your Coolify Backend Env Vars
  const isProduction = process.env.NODE_ENV === 'production';

  let domain = isProduction ? ".mawsool.tech" : undefined;
  let secure = isProduction;

  // Dynamic override for preview environments (e.g. sslip.io)
  // If we are in production mode but the host is NOT mawsool.tech,
  // we assume it's a preview/testing environment which might not support HTTPS or the main domain.
  if (isProduction && req) {
    const host = req.get('host');
    if (host && !host.includes('mawsool.tech')) {
       console.log(`[Cookies] Detected non-standard host: ${host}. Clearing explicit domain and secure flag.`);
       domain = undefined;
       secure = false; // Disable secure to allow HTTP on preview domains
    }
  }

  return {
    // 1. VISIBILITY: Must be false so your Frontend JS can read it (AuthContext)
    httpOnly: false,

    // 2. SECURITY: Always use HTTPS in production (unless override)
    secure: secure,

    // 3. CROSS-DOMAIN: 'lax' is best for redirects (Google/MS login)
    sameSite: "lax",

    // 4. DOMAIN: 
    // If Prod: ".mawsool.tech" (Shared across subdomains)
    // If Local: undefined (Works on localhost)
    domain: domain,
    
    path: "/"
  };
};

function issueAuthCookies(res, user, isNew) {
  // express response object has a reference to request at res.req
  const options = getCookieOptions(res.req);

  const token = jwt.sign(
    { 
      sub: String(user._id), 
      email: user.email, 
      name: user.name || null,
      v: user.tokenVersion || 0 // Include token version
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" } 
  );

  // Set the main Auth Token
  res.cookie("auth-token", token, {
    ...options,
    maxAge: WEEK_MS
  });

  // Set the Login Status (Routing hint for frontend)
  res.cookie("login_status", isNew ? "new" : "old", {
    ...options,
    maxAge: 2 * 60 * 1000 // 2 minutes
  });
}

function clearAuthCookies(res) {
  const options = getCookieOptions(res.req);

  // To delete a cookie successfully, you must provide the EXACT same 
  // domain/path options that were used to create it.
  res.clearCookie("auth-token", options);
  res.clearCookie("login_status", options);
}

module.exports = { issueAuthCookies, clearAuthCookies };
