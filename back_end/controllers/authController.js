// back_end/controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PendingUser = require("../models/PendingUser");
require("../models/Organization"); // Required for populate to work
const { issueAuthCookies, clearAuthCookies } = require("../auth/cookies");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const axios = require("axios");
const dns = require("dns");
const util = require("util");
const resolveMx = util.promisify(dns.resolveMx);
const { validateBusinessEmail } = require('../utils/emailValidator');
const { parsePhoneNumberWithError } = require('libphonenumber-js');
const { fireAndForgetSignupSync } = require('../services/pipedriveService');

exports.register = async (req, res) => {
  // --- Strict Origin / CSRF Enforcement ---
  // Ensure the request actually comes from the browser running the Mawsool frontend
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  
  // Log headers for debugging to see exactly what the frontend is sending
  console.log(`[Auth Register] Request Headers - Origin: ${origin}, Referer: ${referer}, IP: ${req.ip}`);

  const allowedFrontends = [
    "http://localhost:3000",
    "http://localhost:3006",
    "http://localhost:8000",
    "https://leads.mawsool.tech",
    "https://mawsool.tech",
    "https://frontbeta.mawsool.tech",
    "https://testleads.mawsool.tech",
    "https://backbeta.mawsool.tech",
    "https://www.leads.mawsool.tech",
    "https://www.mawsool.tech"
  ];

  // We should also allow empty origin/referer if it's coming from inside our own server/proxy
  // Allow dynamic .sslip.io subdomains for testing environments
  const isAllowedOrigin = !origin || allowedFrontends.includes(origin.replace(/\/$/, "")) || (origin && origin.includes('.sslip.io'));
  const isAllowedReferer = !referer || allowedFrontends.some(allowed => referer.startsWith(allowed)) || (referer && referer.includes('.sslip.io'));

  // Only block if BOTH are provided but NEITHER match our allowed list
  // We relax this because privacy extensions/VPNs often strip Origin/Referer headers
  if (origin && referer && !isAllowedOrigin && !isAllowedReferer) {
    console.log(`[Anti-Bot] Blocked direct API registration attempt from IP: ${req.ip} | Origin: ${origin} | Referer: ${referer}`);
    return res.status(403).json({ msg: "Registration blocked: Invalid Origin/Referer. Are you using a preview URL?" });
  }

  // Extract email early for whitelisting purposes
  const emailForWhitelist = req.body.email ? req.body.email.toLowerCase().trim() : "";
  const isWhitelistedUser = emailForWhitelist === "sara@raseel.gift";

  // --- User-Agent Check ---
  const userAgent = req.headers['user-agent'] || "";
  
  if (!isWhitelistedUser) {
    if (!userAgent || userAgent.length < 10) {
      console.log(`[Anti-Bot] Blocked empty/short User-Agent from IP: ${req.ip}`);
      return res.status(403).json({ msg: "Registration blocked: Invalid browser detected." });
    }

    // Do not block on frozen Safari version tokens.
    // iOS 26 Safari reports CPU iPhone OS 18_7 and Version/26.x by design (UA reduction).
    // Those strings used to look fake; they are now the normal iPhone signup UA.
  }
  // ----------------------------------------

  let { name, email, password, turnstileToken, utmSource, utmMedium, utmCampaign, utmTerm, utmContent } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ msg: "Name, email, and password are required" });
  }

  // Strict Name Validation (Anti-Bot)
  const trimmedName = name ? name.trim() : "";
  if (trimmedName.length < 2 || trimmedName.split(' ').length < 2) {
    console.log(`[Anti-Bot] Blocked invalid name format from IP: ${req.ip}`);
    return res.status(400).json({ msg: "Please provide your full first and last name (e.g. John Doe)." });
  }
  
  // Basic check to prevent URLs or numbers in the name field
  if (/[0-9]/.test(trimmedName) || /http(s)?:\/\//i.test(trimmedName) || /\.com|\.net|\.org/i.test(trimmedName)) {
    console.log(`[Anti-Bot] Blocked URLs/numbers in name field from IP: ${req.ip}`);
    return res.status(400).json({ msg: "Name cannot contain numbers or URLs." });
  }

  if (!turnstileToken) {
    return res.status(400).json({ msg: "Please complete the security check." });
  }

  // Verify Turnstile Token
  try {
    const turnstileResponse = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!turnstileResponse.data.success) {
      console.error("Turnstile verification failed:", turnstileResponse.data);
      return res.status(400).json({ msg: "Security check failed. Please try again." });
    }
  } catch (error) {
    console.error("Error verifying Turnstile token:", error);
    return res.status(500).json({ msg: "Internal server error during security check." });
  }
  
  // Normalize email to lowercase
  email = email.toLowerCase().trim();
  const emailDomain = email.split("@")[1]?.toLowerCase();

  // 1. Unified Validation (Synchronous check first)
  const validation = await validateBusinessEmail(email);
  if (!validation.isValid) {
    return res.status(400).json({ msg: validation.msg });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{10,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ msg: "Password must be at least 10 characters with a special character, uppercase, lowercase, and a number." });
  }

  try {
    const exists = await User.findOne({ email });
    if (exists) {
      if (exists.isVerified) {
        return res.status(400).json({ msg: "Email already in use" });
      } else {
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenHash = crypto
          .createHash("sha256")
          .update(verificationToken)
          .digest("hex");

        exists.verificationToken = verificationTokenHash;
        exists.verificationTokenExpires = Date.now() + 24 * 3600000;
        await exists.save();

        const verifyUrl = `${process.env.FRONTEND_URL}/VerifyEmail?token=${verificationToken}&email=${encodeURIComponent(email)}`;
        try {
          await sendEmail({
            to: exists.email,
            subject: "Verify Your Mawsool Account",
            html: `
              <p>Hello ${exists.name},</p>
              <p>Your account has already been created but is not yet verified.</p>
              <p>Please verify your email address by clicking the button below:</p>
              <a href="${verifyUrl}" class="button">Verify My Email</a>
              <p>Or copy and paste this URL into your browser: <br><a href="${verifyUrl}">${verifyUrl}</a></p>
              <p>This verification link will expire in 24 hours.</p>
            `,
          });
          return res.status(200).json({ msg: "Your account is already created but not verified. A verification link has been sent to your email." });
        } catch (emailError) {
          console.error("Failed to send verification email for existing user:", emailError);
          return res.status(200).json({ msg: "Your account is already created but not verified. We are currently experiencing issues sending emails. Please contact support." });
        }
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // --- Free Account Limit Check ---
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
        return res.status(400).json({ msg: "You have exceeded the amount of free accounts per company, you need to subscribe now" });
      }
    }
    // --------------------------------
    const verificationTokenHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    const getClientIp = (req) => {
      const cfIp = req.headers['cf-connecting-ip'];
      if (cfIp) return cfIp;
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) return forwarded.split(',')[0].trim();
      return req.ip || req.connection.remoteAddress;
    };

    const signupIp = getClientIp(req);
    const signupUserAgent = req.headers['user-agent'] || "";
    const signupReferer = req.headers['referer'] || "";
    const signupUrl = req.headers['origin'] || "";

    // --- WhatsApp Verification Fallback Check ---
    if (validation.requiresWhatsApp) {
      await PendingUser.findOneAndUpdate(
        { email },
        {
          name,
          email,
          password: hash,
          avatar: `${process.env.DEFAULT_AVATAR}${name}`,
          signupIp,
          signupUserAgent,
          signupReferer,
          signupUrl,
          utmSource: utmSource || "",
          utmMedium: utmMedium || "",
          utmCampaign: utmCampaign || "",
          utmTerm: utmTerm || "",
          utmContent: utmContent || ""
        },
        { upsert: true, new: true }
      );

      return res.status(202).json({
        msg: "WhatsApp verification required to complete signup.",
        requiresWhatsApp: true
      });
    }
    // --------------------------------------------

    const user = await User.create({
      name,
      email,
      password: hash,
      avatar: `${process.env.DEFAULT_AVATAR}${name}`,
      verificationToken: verificationTokenHash,
      verificationTokenExpires: Date.now() + 24 * 3600000,
      allowMultipleSessions: false, // Default to single session
      signupIp,
      signupUserAgent,
      signupReferer,
      signupUrl,
      utmSource: utmSource || "",
      utmMedium: utmMedium || "",
      utmCampaign: utmCampaign || "",
      utmTerm: utmTerm || "",
      utmContent: utmContent || ""
    });

    fireAndForgetSignupSync(user);

    const verifyUrl = `${process.env.FRONTEND_URL}/VerifyEmail?token=${verificationToken}&email=${encodeURIComponent(email)}`;
    
    try {
      await sendEmail({
        to: user.email,
        subject: "Verify Your Mawsool Account",
        html: `
          <p>Hello ${user.name},</p>
          <p>Thank you for joining Mawsool AI! We're excited to have you on board.</p>
          <p>To get started, please verify your email address by clicking the button below:</p>
          <a href="${verifyUrl}" class="button">Verify My Email</a>
          <p>Or copy and paste this URL into your browser: <br><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>This verification link will expire in 24 hours.</p>
        `,
      });
      return res.status(201).json({ msg: "Registered. Please check your email to verify your account.", user });
    } catch (emailError) {
      console.error("Failed to send verification email for new user:", emailError);
      return res.status(201).json({ msg: "Registered successfully, but we are currently experiencing issues sending the verification email. Please contact support.", user });
    }

  } catch (err) {
    return res.status(500).json({ msg: "Error", error: err.message });
  }
};

exports.checkMail = async (req, res) => {
  let { email } = req.body;
  if (!email) {
    return res
      .status(400)
      .json({ status: "Error", msg: "Email is required" });
  }

  email = email.toLowerCase().trim();

    const validation = await validateBusinessEmail(email);
    if (!validation.isValid) {
      return res.status(400).json({ status: "Error", msg: validation.msg });
    }

    try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ status: "Error", msg: "Email already in use" });

    // --- Free Account Limit Check ---
    const emailDomain = email.split("@")[1]?.toLowerCase();
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
        return res.status(400).json({ status: "Error", msg: "You have exceeded the amount of free accounts per company, you need to subscribe now" });
      }
    }
    // --------------------------------

    return res.status(201).json({ status: "success", msg: email });
  } catch (err) {
    return res.status(500).json({ status: "error", msg: err.message });
  }
};

exports.sendWhatsAppOtp = async (req, res) => {
  const { email, whatsappNumber } = req.body;
  if (!email || !whatsappNumber) {
    return res.status(400).json({ msg: "Email and WhatsApp number are required" });
  }

  // --- Validate Phone Number Format ---
  try {
    const phoneNumber = parsePhoneNumberWithError(whatsappNumber);
    if (!phoneNumber.isValid()) {
      return res.status(400).json({ msg: "Invalid phone number format. Please ensure you entered the correct country code and number." });
    }
  } catch (error) {
    return res.status(400).json({ msg: "Invalid phone number. " + error.message });
  }
  // ------------------------------------

  // --- Block Specific Country Codes (e.g., Nigeria +234) ---
  // Normalize number by removing +, spaces, dashes, etc.
  const normalizedNumber = whatsappNumber.replace(/[\s\-\+]/g, '');
  if (normalizedNumber.startsWith('234')) {
    console.log(`[Anti-Bot] Blocked WhatsApp OTP request for Nigerian number: ${whatsappNumber}`);
    return res.status(403).json({ msg: "Registration from this region is currently not supported." });
  }
  // ---------------------------------------------------------

  try {
    // 1. Enforce Unique WhatsApp Number
    const existingWhatsAppUser = await User.findOne({ whatsappNumber });
    if (existingWhatsAppUser) {
      return res.status(400).json({ msg: "This WhatsApp number is already registered to another account." });
    }

    const pendingUser = await PendingUser.findOne({ email: email.toLowerCase().trim() });
    if (!pendingUser) {
      return res.status(404).json({ msg: "Signup session expired or not found. Please register again." });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    pendingUser.whatsappNumber = whatsappNumber;
    pendingUser.otp = await bcrypt.hash(otp, 10);
    pendingUser.otpExpires = Date.now() + 10 * 600000; // 10 minutes
    await pendingUser.save();

    // Format the number for Meta (strictly digits, no + or spaces)
    const metaFormattedNumber = whatsappNumber.replace(/[\s\-\+]/g, '');

    // Send via Meta Official WhatsApp API
    const metaApiUrl = process.env.META_WA_API_URL || "https://graph.facebook.com/v25.0/1280022608520494/messages";
    const metaAccessToken = process.env.META_WA_ACCESS_TOKEN || "EAALwXuUMEAcBSIfyZAdlZCK7tZBPAHNdjZAhjcD3ZC0HfZBKodSJt7Jf1ZBoG0LMw552hcDKDn0ABRwmnl2JG2y8c0Ow97CYTtMS55g72LfvulzjAZA3IMHNzXgcRFkUMVxtaZCRsHKtFCqO1ZAZAsO5HhaL6mgqQxbl5zkfbhSCD0NlICASSNfZAnZCGZCDrhYZBkSkWmSuwZDZD";
    
    const payload = {
      messaging_product: "whatsapp",
      to: metaFormattedNumber,
      type: "template",
      template: {
        name: "test_d", // Using the template name provided
        language: {
          code: "en"
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: otp
              }
            ]
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: otp
              }
            ]
          }
        ]
      }
    };

    await axios.post(metaApiUrl, payload, {
      headers: {
        "Authorization": `Bearer ${metaAccessToken}`,
        "Content-Type": "application/json"
      }
    });

    return res.status(200).json({ msg: "OTP sent to WhatsApp successfully" });
  } catch (error) {
      // Improved Error Logging for Meta API
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error("[Meta API Error] Status:", error.response.status);
        console.error("[Meta API Error] Data:", JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        // The request was made but no response was received
        console.error("[Meta API Error] No response received:", error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error("[Meta API Error] Setup Error:", error.message);
      }
      console.error("[Anti-Bot] WhatsApp OTP Send Error:", error);
      return res.status(500).json({ msg: "Failed to send WhatsApp message. Please check the number and try again." });       
    }
};

exports.verifyWhatsAppOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ msg: "Email and OTP are required" });
  }

  try {
    const pendingUser = await PendingUser.findOne({ email: email.toLowerCase().trim() });
    if (!pendingUser) {
      return res.status(404).json({ msg: "Signup session expired. Please register again." });
    }

    if (pendingUser.otpExpires < Date.now()) {
      return res.status(400).json({ msg: "OTP has expired. Please request a new one." });
    }

    const isMatch = await bcrypt.compare(otp, pendingUser.otp);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid OTP" });
    }

    // Create real User - Require Email Verification Again
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenHash = crypto.createHash("sha256").update(verificationToken).digest("hex");

    const user = await User.create({
      name: pendingUser.name,
      email: pendingUser.email,
      password: pendingUser.password, // Already hashed
      avatar: pendingUser.avatar,
      verificationToken: verificationTokenHash,
      verificationTokenExpires: Date.now() + 24 * 3600000,
      isVerified: false, // Explicitly require email verification
      whatsappNumber: pendingUser.whatsappNumber, // Save the WhatsApp number to enforce uniqueness
      allowMultipleSessions: false,
      signupIp: pendingUser.signupIp,
      signupUserAgent: pendingUser.signupUserAgent,
      signupReferer: pendingUser.signupReferer,
      signupUrl: pendingUser.signupUrl,
      utmSource: pendingUser.utmSource,
      utmMedium: pendingUser.utmMedium,
      utmCampaign: pendingUser.utmCampaign,
      utmTerm: pendingUser.utmTerm,
      utmContent: pendingUser.utmContent,
      isWhatsAppVerified: true // Tracking field if needed
    });

    fireAndForgetSignupSync(user);

    // Send standard email verification
    const verifyUrl = `${process.env.FRONTEND_URL}/VerifyEmail?token=${verificationToken}&email=${encodeURIComponent(user.email)}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Verify Your Mawsool Account",
        html: `
          <p>Hello ${user.name},</p>
          <p>Thank you for joining Mawsool AI! We're excited to have you on board.</p>
          <p>To get started, please verify your email address by clicking the button below:</p>
          <a href="${verifyUrl}" class="button">Verify My Email</a>
          <p>Or copy and paste this URL into your browser: <br><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>This verification link will expire in 24 hours.</p>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send verification email after WhatsApp:", emailError);
    }

    // Cleanup pending user
    await PendingUser.deleteOne({ _id: pendingUser._id });

    return res.status(201).json({ msg: "WhatsApp verified successfully. Please check your email to verify your account.", user });
  } catch (error) {
    console.error("[Anti-Bot] WhatsApp Verification Error:", error);
    return res.status(500).json({ msg: "Internal server error during verification" });
  }
};

exports.login = async (req, res) => {
  console.log(`[Auth Login] Attempting login for email: ${req.body.email}`);
  let { email, password } = req.body;
  if (email) email = email.toLowerCase(); // Ensure lowercase
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Verification Check
    if (user.role !== "admin" && !user.isVerified && !user.googleId && !user.microsoftId) {
      return res.status(403).json({ msg: "Please verify your email address before logging in." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ msg: "Invalid credentials" });

    // --- Single Session Logic ---
    // Increment token version to invalidate all previous tokens
    // UNLESS user has allowMultipleSessions = true
    if (!user.allowMultipleSessions) {
      if (!user.tokenVersion) user.tokenVersion = 0;
      user.tokenVersion += 1;
    }
    
    // Still track IP for audit logs
    const getClientIp = (req) => {
      const cfIp = req.headers['cf-connecting-ip'];
      if (cfIp) return cfIp;
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) return forwarded.split(',')[0].trim();
      return req.ip || req.connection.remoteAddress;
    };
    user.lastLoginIp = getClientIp(req);
    // ----------------------------

    if (user.onboarded == null) {
      user.onboarded = true;
    }
    await user.save();

    issueAuthCookies(res, user, false);

    return res.json({ msg: "Login successful", data: user });
  } catch (err) {
    return res.status(500).json({ msg: "Error", error: err.message });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) {
      return res.status(400).json({ msg: "Token and email are required" });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      email,
      verificationToken: tokenHash,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ msg: "We couldn't verify your email address. Please check your inbox and try again, or request a new verification email." });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.status(200).json({ msg: "Email verified successfully" });
  } catch (err) {
    return res.status(500).json({ msg: "Error verifying email", error: err.message });
  }
};

exports.success = (req, res) => {
  const user = req.user;
  const hinted = req.authInfo?.isNew;
  const isNew = typeof hinted === "boolean" ? hinted : false;

  if (!user) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/signin?error=${encodeURIComponent(
        "No user in OAuth flow"
      )}`
    );
  }

  // 1. Handle New Users
  if (isNew) {
    // DO NOT set onboarded = true here for new users!
    // Let them go through the onboarding process on the frontend.
    // The complete-onboarding endpoint will set this to true later.
    try {
      user.onboarded = false; // Ensure it's false so they see the tutorial
      user.save().catch(() => {});
    } catch {}
  }

  // 2. Issue Cookies
  issueAuthCookies(res, user, isNew);

  const stateDate = req.query.state ? JSON.parse(req.query.state) : {};
  const { returnUrl = "/search", from, redirect, plan, interval } = stateDate;

  // 3. Handle Special Pricing/Redirects
  if (redirect && plan && interval) {
    const redirectUrl = new URL(`${process.env.FRONTEND_URL}/signin`);
    redirectUrl.searchParams.set("status", isNew ? "new" : "old");
    redirectUrl.searchParams.set("returnUrl", `setting/${encodeURIComponent(redirect)}?plan=${encodeURIComponent(plan)}&interval=${encodeURIComponent(interval)}`);
    redirectUrl.searchParams.set("redirect", encodeURIComponent(redirect));
    redirectUrl.searchParams.set("plan", encodeURIComponent(plan));
    redirectUrl.searchParams.set("interval", encodeURIComponent(interval));
    return res.redirect(redirectUrl.toString());
  }
  
  // 4. THE FIX: Redirect existing users to /search (Dashboard) instead of /signin
  // If user is new OR not onboarded -> /onBoarding
  // If user is old and onboarded -> /search
  const needsOnboarding = isNew || !user.onboarded;
  const final = new URL(`${process.env.FRONTEND_URL}${needsOnboarding ? '/onBoarding' : '/search'}`);
  
  final.searchParams.set("status", isNew ? "new" : "old");
  
  if(needsOnboarding) {
     final.searchParams.set("returnUrl", "/onBoarding");
  } else if (returnUrl && returnUrl !== "/search") {
     final.searchParams.set("returnUrl", returnUrl);
  }
  
  final.searchParams.set("page", from);

  return res.redirect(final.toString());
};

exports.failure = (req, res) => {
  const errorMessage = req.query.message || "Login failed";
  return res.redirect(
    `${process.env.FRONTEND_URL}/signin?error=${encodeURIComponent(errorMessage)}`
  );
};

exports.me = async (req, res) => {
  try {
    const token = req.cookies?.["auth-token"];
    if (!token)
      return res.status(401).json({ error: `unauthenticated ${token}` });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).populate('orgId', 'planKey currentPeriodEnd').lean();
    if (!user) return res.status(401).json({ error: "not_found" });
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    return res.json({
      id: String(user._id),
      email: user.email,
      name: user.name,
      avatar: user.avatar || null,
      role: user.role || "user",
      orgId: user.orgId ? String(user.orgId._id) : null,
      planKey: user.planKey || user.orgId?.planKey || null,
      orgRole: user.orgRole || null,
      credits: user.credits,
      createdAt: user.createdAt,
      onboarded: !!user.onboarded,
      isVerified: !!user.isVerified,
      allowMultipleSessions: !!user.allowMultipleSessions,
      currentPeriodEnd: user.orgId?.currentPeriodEnd || null,
    });
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
};

exports.logout = async (_req, res) => {
  clearAuthCookies(res);
  return res.status(204).end();
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ msg: "Email is required" });

    const normalized = String(email).toLowerCase().trim();
    let user = await User.findOne({ email: normalized });
    if (!user) {
      user = await User.findOne({
        $expr: { $eq: [{ $toLower: "$email" }, normalized] },
      });
    }

    if (!user)
      return res.status(200).json({
        msg: "This Account is not associated. Please Enter your correct Email!",
      });

    if ((user.googleId || user.microsoftId) && !user.password) {
      return res.status(200).json({
        msg: "This email uses Google or Microsoft to sign in. Please use the appropriate sign-in button.",
        isOAuthUser: true,
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.passwordResetToken = resetTokenHash;
    user.passwordResetExpires = Date.now() + 24 * 3600000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/resetPassword/${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <p>Hello,</p>
        <p>You requested a password reset for your Mawsool AI account.</p>
        <p>Please click the link below to set a new password:</p>
        <p><a href="${resetUrl}" class="button">Reset my password</a></p>
        <p>Or copy and paste this URL in your browser: ${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this reset, please ignore this email.</p>
        <p>Thank you,<br>Mawsool AI Team</p>
      `,
    });

    return res.status(200).json({
      msg: "Password reset link sent to your email",
    });
  } catch (err) {
    console.error("Password reset error:", err);
    return res
      .status(500)
      .json({ msg: "Error sending reset email", error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ msg: "Token and password are required" });
    }

    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: resetTokenHash,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ msg: "Token is invalid or has expired" });

    const hash = await bcrypt.hash(password, 10);
    user.password = hash;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Fix: Do not log in the user if they are not verified
    if (!user.isVerified && !user.googleId && !user.microsoftId) {
      return res.status(200).json({
        msg: "Password reset successful. Please verify your email address before logging in."
      });
    }

    issueAuthCookies(res, user, false);

    return res.status(200).json({ msg: "Password reset successful" });
  } catch (err) {
    console.error("Password reset error:", err);
    return res
      .status(500)
      .json({ msg: "Error resetting password", error: err.message });
  }
};

exports.completeOnboarding = async (req, res) => {
  try {
    const user = req.userObj;
    if (!user) {
      return res.status(401).json({ msg: "User not authenticated" });
    }
    user.onboarded = true;
    await user.save();
    
    // RE-ISSUE COOKIE: Update the cookie to reflect any changes and ensure persistence
    issueAuthCookies(res, user, false);

    return res.status(200).json({
      msg: "Onboarding completed successfully",
      data: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        avatar: user.avatar || null,
        role: user.role || "user",
        credits: user.credits,
        createdAt: user.createdAt,
        onboarded: user.onboarded,
        isVerified: !!user.isVerified,
        allowMultipleSessions: !!user.allowMultipleSessions,
      },
    });
  } catch (err) {
    return res.status(500).json({ msg: "Error", error: err.message });
  }
};