// routes/auth.js
const express = require("express");
// const passport = require("passport");
const passport = require("../auth/passport");
const router = express.Router();
const authController = require("../controllers/authController");
const requireAuth = require("../auth/requireAuth");
const { isAuthenticated } = require("../middlewares/authMiddleware");
const rateLimit = require("express-rate-limit");

// IP Rate Limiting for Auth Routes
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 100, // Temporarily increased from 7 to 100 for the summit
  message: { msg: "Too many requests from this IP, please try again after an hour" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Email/Password
router.post("/register", authLimiter, authController.register);
router.post("/check-mail", authLimiter, authController.checkMail);
router.post("/send-whatsapp-otp", authLimiter, authController.sendWhatsAppOtp);
router.post("/verify-whatsapp-otp", authLimiter, authController.verifyWhatsAppOtp);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/verify-email", authController.verifyEmail);

// ----- GOOGLE -----
router.get("/google", (req, res, next) => {
  // keep your simple state (URL-encoded returnUrl)
  const state = JSON.stringify({
    returnUrl: req.query.returnUrl ? decodeURIComponent(req.query.returnUrl) : undefined,
    from: req.query.from, 
    redirect: req.query.redirect, 
    plan: req.query.plan, 
    interval: req.query.interval, 
  });
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
    prompt: "select_account",
  })(req, res, next);
});

// custom callback -> we keep BOTH user and info (isNew)
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false },
    (err, user, info) => {
      if (err) {
        return res.redirect(`/api/auth/failure?message=${encodeURIComponent(err.message || "Login failed")}`);
      }
      if (!user) {
        return res.redirect("/api/auth/failure?message=Login%20failed");
      }
      req.user = user;          // mongoose doc with _id
      req.authInfo = info || {}; // { isNew: true/false }
      return authController.success(req, res);
    }
  )(req, res, next);
});

// ----- MICROSOFT -----
router.get("/microsoft", (req, res, next) => {
  const state = JSON.stringify({
    returnUrl: req.query.returnUrl ? decodeURIComponent(req.query.returnUrl) : undefined,
    from: req.query.from,
    redirect: req.query.redirect, 
    plan: req.query.plan, 
    interval: req.query.interval, 
  });
  passport.authenticate("microsoft", {
    scope: ["user.read", "openid", "email", "profile"],
    state,
  })(req, res, next);
});

router.get("/microsoft/callback", (req, res, next) => {
  passport.authenticate("microsoft", { session: false },
    (err, user, info) => {
      if (err) {
        return res.redirect(`/api/auth/failure?message=${encodeURIComponent(err.message || "Login failed")}`);
      }
      if (!user) {
        return res.redirect("/api/auth/failure?message=Login%20failed");
      }
      req.user = user;          // mongoose doc
      req.authInfo = info || {}; // { isNew }
      return authController.success(req, res);
    }
  )(req, res, next);
});

// Common
router.get("/success", authController.success);
router.get("/failure", authController.failure);
router.get("/me", require("../auth/requireAuth"), authController.me);
router.post("/logout", authController.logout);
router.post("/complete-onboarding", isAuthenticated,authController.completeOnboarding);

module.exports = router;