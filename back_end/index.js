const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
// FORCE GOOGLE DNS TO FIX LOCAL RESOLUTION ISSUES
try {
  require('dns').setServers(['8.8.8.8', '1.1.1.1']);
  console.log("DNS Servers set to Google/Cloudflare");
} catch (e) {
  console.log("Could not set custom DNS servers");
}

dotenv.config();
const session = require("express-session");
const cookieParser = require("cookie-parser");
const passport = require("passport");

// --- Route Imports ---
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const listRoutes = require("./routes/list");
const aiRoutes = require("./routes/ai");
const creditRoutes = require("./routes/credits");
const paymentRoutes = require("./routes/payment");
const filterRoutes = require("./routes/filter");
const webhookRoutes = require("./routes/webhook");
const subscriptionRoutes = require("./routes/subscription");
const teamRoutes = require("./routes/team");
const AdminRoutes = require("./routes/adminRoutes");
const RevealRoutes = require("./routes/revealRoutes");
const doNotSellMyData = require("./routes/do-not-sell-my-data");
const ssoRoutes = require("./routes/sso");
const searchProxyRoutes = require("./routes/searchProxy");
const searchIdsRoutes = require("./routes/searchIds");
const pdplConsentRoutes = require("./routes/pdplConsent");
const salesforceRoutes = require("./routes/salesforce");
const pipedriveRoutes = require("./routes/pipedrive");
const mawsoolRoutes = require("./routes/mawsoolRoutes");
const { publicRouter: oauthPublicRoutes, apiRouter: oauthApiRoutes, oauthController } = require("./routes/oauth");
const revealEvents = require("./utils/revealEvents");

const app = express();
// require("./config/passport"); // REMOVED: V1 Legacy Passport. Using V2 auth/passport.js instead.

// Trust Proxy: Required for Cookie Security behind Coolify/Nginx
// Also required for correct IP detection
app.set("trust proxy", 1);

// ====================================================================
// 1. CORS CONFIGURATION
// ====================================================================

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3006",
  "https://mawsool-user-dashboard.vercel.app",
  "https://mawsool-web.vercel.app",
  "https://leads.mawsool.tech",
  "https://mawsool.tech",
  "https://frontbeta.mawsool.tech",
  "https://testleads.mawsool.tech",
  "https://backbeta.mawsool.tech",
  "https://www.leads.mawsool.tech",
  "https://www.mawsool.tech",
  "https://api-test.mawsool.tech",
  "https://app-test.mawsool.tech",
  "https://mcp.mawsool.tech",
  "https://chatgpt.com",
  "https://chatgpt-mcp.mawsool.tech",
];

const localLanOrigin = (origin) => {
  try {
    if (!origin) return false;
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (/^192\.168\.(\d|\d\d)\.(\d|\d\d)$/.test(url.hostname) || url.hostname.endsWith('.sslip.io')) &&
      (url.port === "3000" || url.port === "3001" || url.port === "" || url.port === "80" || url.port === "443")
    );
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || localLanOrigin(origin)) {
      callback(null, true);
    } else {
      console.log("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Mawsool-Internal-Secret', 'X-Mawsool-User-Email']
};

app.use(cors(corsOptions));

// --- 2. JSON Body Parser ---
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use((req, res, next) => {
  if (req.originalUrl && req.originalUrl.includes("/api/webhooks/stripe")) {
    express.raw({ type: "application/json", limit: '50mb' })(req, res, next);
  } else {
    express.json({ limit: '50mb' })(req, res, next);
  }
});

// ====================================================================
// 3. COOKIE & SESSION (DYNAMIC: WORKS FOR LOCAL & PROD)
// ====================================================================

// Check if we are in production.
// IMPORTANT: On Coolify, ensure your NODE_ENV is set to 'production'
const isProduction = process.env.NODE_ENV === 'production';

// Dynamic Settings
const cookieSettings = {
  // If Prod: true (HTTPS only). If Local: false (HTTP allowed)
  secure: isProduction, 
  
  // If Prod: "lax" (Subdomains). If Local: "lax" (Standard)
  sameSite: "lax", 
  
  // Always false so Frontend JS can see it
  httpOnly: false, 
  
  // If Prod: ".mawsool.tech". If Local: undefined (let browser decide)
  domain: isProduction ? ".mawsool.tech" : undefined,
  
  maxAge: 24 * 60 * 60 * 1000 // 1 day
};

console.log(`Cookie Config Loaded: Mode=${isProduction ? 'PROD' : 'DEV'}, Domain=${cookieSettings.domain}`);

app.use(cookieParser());
app.use(
  session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false, 
    cookie: cookieSettings,
  })
);

// --- 4. Passport & Routes ---
app.use(passport.initialize());
app.use(passport.session());

// Debug Route
app.get('/api/debug-cookie', (req, res) => {
  res.json({ 
    message: "Cookie Check", 
    hasCookie: !!req.cookies['auth-token'], 
    environment: isProduction ? "Production" : "Development",
    settings: cookieSettings
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/list", listRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/credits", creditRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/filters", filterRoutes);
app.use("/api", webhookRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/admin", AdminRoutes);
app.use('/api/reveal', RevealRoutes);
app.use('/api/do-not-sell-my-data', doNotSellMyData);
app.use('/api/sso', ssoRoutes);
app.use('/api/proxy', searchProxyRoutes);
app.use('/search-ids', searchIdsRoutes);
app.use('/api/pdpl-consent', pdplConsentRoutes);
app.use('/api/salesforce', salesforceRoutes);
app.use('/api/pipedrive', pipedriveRoutes);
app.use('/api/mawsool', mawsoolRoutes);

// --- OAuth 2.1 (Claude / MCP Directory) ---
app.get("/.well-known/oauth-authorization-server", oauthController.authorizationServerMetadata);
app.get("/.well-known/openid-configuration", oauthController.openidConfiguration);
app.get("/.well-known/oauth-protected-resource", oauthController.protectedResourceMetadata);
app.get("/.well-known/oauth-protected-resource/mcp", oauthController.protectedResourceMetadata);
app.use("/oauth", oauthPublicRoutes);
app.use("/api/oauth", oauthApiRoutes);
app.use("/api/internal/mcp", require("./routes/internalMcp"));

app.get('/api/reveal/stream', (req, res) => {
  const enabled = String(process.env.REVEAL_SYNC_ENABLED || 'true').toLowerCase() === 'true';
  if (!enabled) return res.status(404).end();
  const userId = req.user && (req.user.id || req.user.sub || req.user._id);
  if (!userId) return res.status(401).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write(`event: ping\n`);
  res.write(`data: {}\n\n`);
  
  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write('event: ping\n');
    res.write('data: {}\n\n');
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeat);
  });

  revealEvents.subscribe(userId, res);
});

app.get('/', (req, res) => {
  res.send('Mawsool Backend is Running');
});

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
      console.log("MongoDB connected");
      try {
        const RevealedContact = require("./models/RevealedContact");
        if (typeof RevealedContact.ensureRevealedContactIndexes === "function") {
          await RevealedContact.ensureRevealedContactIndexes();
        }
      } catch (idxErr) {
        console.warn("RevealedContact index ensure failed:", idxErr.message);
      }
      const port = process.env.PORT || 5000;
      app.listen(port, () =>
        console.log(`Server running on port ${port}`)
      );
      // Create missing indexes in the background. Do not use syncIndexes() —
      // that drops Atlas/manual indexes. Wait until the replica set is healthy
      // before a production deploy; index builds add load.
      setImmediate(() => {
        Promise.allSettled([
          require("./models/List").createIndexes(),
          require("./models/ListItem").createIndexes(),
          require("./models/Credit").createIndexes(),
          require("./models/User").createIndexes(),
          require("./models/AiQuery").createIndexes(),
          require("./models/Organization").createIndexes(),
        ]).then((results) => {
          results.forEach((r, i) => {
            if (r.status === "rejected") {
              console.warn("[indexes] createIndexes failed:", r.reason?.message || r.reason);
            }
          });
          console.log("[indexes] background createIndexes finished");
        });
      });
    })
  .catch((err) => console.error("MongoDB Error:", err));
