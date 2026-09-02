const OAuthClient = require("../models/OAuthClient");
const AuthCode = require("../models/AuthCode");
const OAuthToken = require("../models/OAuthToken");
const User = require("../models/User");
const { getBalanceForUser, deductCreditsForUser } = require("../utils/wallet");
const {
  randomToken,
  pkceChallengeFromVerifier,
  hashSecret,
  redirectUriAllowed,
  getIssuer,
  getFrontendUrl,
  getMcpResourceUrl,
  parseScopes,
} = require("../utils/oauthHelpers");
const {
  resolveOAuthClient,
  assertClientSecret,
} = require("../utils/oauthClients");

function oauthError(res, status, error, description) {
  return res.status(status).json({
    error,
    error_description: description,
  });
}

function getUserId(req) {
  return req.user?._id || req.user?.sub || req.user?.id || req.userObj?._id;
}

/** Always the shared Apicool key for upstream data — never invent per-user keys. */
function mainApiKey() {
  return (
    process.env.MAWSOOL_DEFAULT_API_KEY ||
    process.env.MAWSOOL_API_KEY ||
    null
  );
}

async function resolveMcpApiKey() {
  return mainApiKey();
}

function bearerFromReq(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

async function findTokenRecord(accessToken) {
  if (!accessToken) return null;
  return OAuthToken.findOne({
    accessToken,
    revoked: false,
    accessTokenExpiresAt: { $gt: new Date() },
  });
}

async function issueTokens({ userId, clientId, scopes, resource, mcpApiKey }) {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  const accessTtl = Number(process.env.OAUTH_ACCESS_TOKEN_TTL || 3600);
  const refreshTtl = Number(process.env.OAUTH_REFRESH_TOKEN_TTL || 60 * 60 * 24 * 30);

  await OAuthToken.create({
    accessToken,
    refreshToken,
    userId,
    clientId,
    scopes,
    resource: resource || getMcpResourceUrl(),
    mcpApiKey: mcpApiKey || (await resolveMcpApiKey()),
    accessTokenExpiresAt: new Date(Date.now() + accessTtl * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + refreshTtl * 1000),
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: accessTtl,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

/**
 * GET /oauth/authorize
 * Browser entry: validate client, then send user to FE consent (or signin).
 */
exports.getAuthorize = async (req, res) => {
  try {
    const {
      client_id,
      redirect_uri,
      response_type,
      state,
      code_challenge,
      code_challenge_method,
      scope,
      resource,
    } = req.query;

    if (!client_id || !redirect_uri) {
      return oauthError(res, 400, "invalid_request", "client_id and redirect_uri are required");
    }
    if (response_type && response_type !== "code") {
      return oauthError(res, 400, "unsupported_response_type", "Only response_type=code is supported");
    }
    if (!code_challenge) {
      return oauthError(res, 400, "invalid_request", "PKCE code_challenge is required");
    }
    if (code_challenge_method && code_challenge_method !== "S256") {
      return oauthError(res, 400, "invalid_request", "Only code_challenge_method=S256 is supported");
    }

    const client = await resolveOAuthClient(client_id);
    if (!client) {
      return oauthError(res, 400, "invalid_client", "Unknown or inactive client_id");
    }
    if (!redirectUriAllowed(client.redirectUris, redirect_uri)) {
      return oauthError(res, 400, "invalid_request", "redirect_uri is not registered for this client");
    }

    const fe = getFrontendUrl();
    const qs = new URLSearchParams({
      client_id,
      redirect_uri,
      response_type: response_type || "code",
      state: state || "",
      code_challenge,
      code_challenge_method: code_challenge_method || "S256",
      scope: scope || "mcp offline_access",
      resource: resource || getMcpResourceUrl(),
    });

    // Always land on the FE consent screen (it handles login redirect).
    // Avoid relying on auth cookies on the API host.
    return res.redirect(`${fe}/oauth/authorize?${qs.toString()}`);
  } catch (error) {
    console.error("OAuth getAuthorize error:", error);
    return oauthError(res, 500, "server_error", "Internal server error");
  }
};

/**
 * GET /api/oauth/authorize/validate — FE can pre-check client before showing consent
 */
exports.validateAuthorize = async (req, res) => {
  try {
    const { client_id, redirect_uri } = req.query;
    const client = await resolveOAuthClient(client_id);
    if (!client) {
      return res.status(400).json({ msg: "Invalid client_id" });
    }
    if (!redirectUriAllowed(client.redirectUris, redirect_uri)) {
      return res.status(400).json({ msg: "Invalid redirect_uri" });
    }
    return res.status(200).json({
      message: "Valid client, safe to show consent screen",
      clientName: client.name,
      redirectUri: redirect_uri,
      applicationType: client.applicationType || "native",
      isCimd: !!client.isCimd,
    });
  } catch (error) {
    console.error("OAuth validateAuthorize error:", error);
    return res.status(500).json({ msg: "Internal server error" });
  }
};

/**
 * POST /api/oauth/authorize — consent approval (cookie session required)
 */
exports.postAuthorize = async (req, res) => {
  try {
    const {
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state,
      scope,
      resource,
    } = req.body;

    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ msg: "Authentication required" });
    }

    const client = await resolveOAuthClient(client_id);
    if (!client) {
      return res.status(400).json({ msg: "Invalid client_id" });
    }
    if (!redirectUriAllowed(client.redirectUris, redirect_uri)) {
      return res.status(400).json({ msg: "Invalid redirect_uri" });
    }
    if (!code_challenge) {
      return res.status(400).json({ msg: "code_challenge is required" });
    }

    const code = randomToken(16);
    const scopes = parseScopes(scope);

    await AuthCode.create({
      code,
      userId,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || "S256",
      scopes,
      resource: resource || getMcpResourceUrl(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // Upstream data uses shared main Apicool key (env). SaaS wallet billed separately.

    const redirect = new URL(redirect_uri);
    redirect.searchParams.set("code", code);
    if (state) redirect.searchParams.set("state", state);
    // RFC 9207 / MCP: Claude requires iss on the authorization response
    redirect.searchParams.set("iss", getIssuer());

    return res.status(200).json({ redirectUrl: redirect.toString() });
  } catch (error) {
    console.error("OAuth postAuthorize error:", error);
    return res.status(500).json({ msg: "Internal server error" });
  }
};

/**
 * POST /oauth/token — authorization_code + refresh_token (form-urlencoded or JSON)
 */
exports.exchangeToken = async (req, res) => {
  try {
    const body = req.body || {};
    const grantType = body.grant_type;

    if (grantType === "authorization_code") {
      return handleAuthorizationCode(req, res, body);
    }
    if (grantType === "refresh_token") {
      return handleRefreshToken(req, res, body);
    }
    return oauthError(res, 400, "unsupported_grant_type", "Supported: authorization_code, refresh_token");
  } catch (error) {
    console.error("OAuth exchangeToken error:", error);
    return oauthError(res, 500, "server_error", "Internal server error");
  }
};

async function handleAuthorizationCode(req, res, body) {
  const { code, code_verifier, client_id, redirect_uri, client_secret } = body;

  console.log("[OAuth] token authorization_code", {
    client_id,
    hasCode: !!code,
    hasVerifier: !!code_verifier,
    redirect_uri,
  });

  if (!code || !code_verifier || !client_id) {
    return oauthError(res, 400, "invalid_request", "code, code_verifier, and client_id are required");
  }

  const client = await resolveOAuthClient(client_id);
  if (!client) {
    return oauthError(res, 401, "invalid_client", "Unknown client");
  }

  if (!assertClientSecret(client, client_secret)) {
    return oauthError(res, 401, "invalid_client", "Invalid client credentials");
  }

  const authCode = await AuthCode.findOne({
    code,
    clientId: client_id,
    expiresAt: { $gt: new Date() },
  });

  if (!authCode) {
    return oauthError(res, 400, "invalid_grant", "Invalid or expired authorization code");
  }

  if (redirect_uri && authCode.redirectUri !== redirect_uri) {
    return oauthError(res, 400, "invalid_grant", "redirect_uri mismatch");
  }

  const challenge = pkceChallengeFromVerifier(code_verifier);
  if (challenge !== authCode.codeChallenge) {
    return oauthError(res, 400, "invalid_grant", "Invalid code_verifier");
  }

  await AuthCode.deleteOne({ _id: authCode._id });

  const tokens = await issueTokens({
    userId: authCode.userId,
    clientId: client_id,
    scopes: authCode.scopes,
    resource: authCode.resource,
  });

  return res.status(200).json(tokens);
}

async function handleRefreshToken(req, res, body) {
  const { refresh_token, client_id, client_secret } = body;

  if (!refresh_token || !client_id) {
    return oauthError(res, 400, "invalid_request", "refresh_token and client_id are required");
  }

  const client = await resolveOAuthClient(client_id);
  if (!client) {
    return oauthError(res, 401, "invalid_client", "Unknown client");
  }

  if (!assertClientSecret(client, client_secret)) {
    return oauthError(res, 401, "invalid_client", "Invalid client credentials");
  }

  // Detect refresh-token reuse (already rotated/revoked) → revoke family
  const reused = await OAuthToken.findOne({
    refreshToken: refresh_token,
    clientId: client_id,
    revoked: true,
  });
  if (reused) {
    await OAuthToken.updateMany(
      { userId: reused.userId, clientId: client_id, revoked: false },
      { $set: { revoked: true } }
    );
    return oauthError(res, 400, "invalid_grant", "Refresh token reuse detected");
  }

  const existing = await OAuthToken.findOne({
    refreshToken: refresh_token,
    clientId: client_id,
    revoked: false,
    refreshTokenExpiresAt: { $gt: new Date() },
  });

  if (!existing) {
    return oauthError(res, 400, "invalid_grant", "Invalid or expired refresh token");
  }

  // Rotate refresh tokens (required for public clients / OAuth 2.1)
  existing.revoked = true;
  await existing.save();

  const tokens = await issueTokens({
    userId: existing.userId,
    clientId: client_id,
    scopes: existing.scopes,
    resource: existing.resource,
    mcpApiKey: existing.mcpApiKey,
  });

  return res.status(200).json(tokens);
}

/**
 * POST /oauth/register — Dynamic Client Registration (RFC 7591)
 */
exports.registerClient = async (req, res) => {
  try {
    const {
      redirect_uris,
      client_name,
      token_endpoint_auth_method,
      grant_types,
      response_types,
      scope,
      application_type,
    } = req.body || {};

    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return oauthError(res, 400, "invalid_client_metadata", "redirect_uris is required");
    }

    const applicationType =
      application_type === "web" || application_type === "native"
        ? application_type
        : "native";

    for (const uri of redirect_uris) {
      let parsed;
      try {
        parsed = new URL(uri);
      } catch {
        return oauthError(res, 400, "invalid_redirect_uri", `Invalid redirect_uri: ${uri}`);
      }

      const isLoopback =
        parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

      if (applicationType === "web") {
        if (parsed.protocol !== "https:" || isLoopback) {
          return oauthError(
            res,
            400,
            "invalid_redirect_uri",
            `application_type=web requires HTTPS non-loopback redirect_uri: ${uri}`
          );
        }
      }
    }

    // Always allow Claude hosted callbacks (ai + com) for Directory / connectors
    const claudeCallbacks = [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
    ];
    // Claude Code CIMD loopback declarations (port-agnostic match handled at authorize)
    const claudeCodeLoopbacks = [
      "http://localhost/callback",
      "http://127.0.0.1/callback",
    ];
    const mergedRedirects = Array.from(
      new Set([
        ...redirect_uris,
        ...claudeCallbacks,
        ...(applicationType === "native" ? claudeCodeLoopbacks : []),
      ])
    );

    const authMethod = token_endpoint_auth_method || "none";
    const clientId = `mcp_${randomToken(16)}`;
    let clientSecret = null;
    let clientSecretHash = null;

    if (authMethod !== "none") {
      clientSecret = randomToken(24);
      clientSecretHash = hashSecret(clientSecret);
    }

    const client = await OAuthClient.create({
      clientId,
      clientSecretHash,
      name: client_name || "Claude MCP Client",
      redirectUris: mergedRedirects,
      grantTypes: grant_types || ["authorization_code", "refresh_token"],
      responseTypes: response_types || ["code"],
      tokenEndpointAuthMethod: authMethod,
      applicationType,
      scopes: parseScopes(scope),
      dynamicallyRegistered: true,
      isActive: true,
    });

    const response = {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      application_type: client.applicationType,
      client_name: client.name,
    };

    if (clientSecret) {
      response.client_secret = clientSecret;
      response.client_secret_expires_at = 0;
    }

    return res.status(201).json(response);
  } catch (error) {
    console.error("OAuth registerClient error:", error);
    return oauthError(res, 500, "server_error", "Internal server error");
  }
};

/**
 * POST /oauth/revoke — RFC 7009 (Directory / OAuth 2.1 hygiene)
 * Always returns 200 whether or not the token existed.
 */
exports.revokeToken = async (req, res) => {
  try {
    const token = req.body?.token;
    const hint = String(req.body?.token_type_hint || "").toLowerCase();
    if (!token) {
      return res.status(200).json({});
    }

    const query =
      hint === "refresh_token"
        ? { refreshToken: token }
        : hint === "access_token"
          ? { accessToken: token }
          : { $or: [{ accessToken: token }, { refreshToken: token }] };

    await OAuthToken.updateMany(query, { $set: { revoked: true } });
    return res.status(200).json({});
  } catch (error) {
    console.error("OAuth revokeToken error:", error);
    // RFC 7009: still return 200 to the client
    return res.status(200).json({});
  }
};

/**
 * POST /oauth/introspect — used by Mawsool-MCP to validate Bearer tokens
 */
exports.introspect = async (req, res) => {
  try {
    const token = req.body?.token || req.body?.access_token;
    if (!token) {
      return res.status(200).json({ active: false });
    }

    const record = await OAuthToken.findOne({
      accessToken: token,
      revoked: false,
      accessTokenExpiresAt: { $gt: new Date() },
    }).populate("userId", "email name role mcpApiKey");

    if (!record) {
      return res.status(200).json({ active: false });
    }

    const user = record.userId;
    // Always shared main key for Apicool data calls
    const mcpApiKey = mainApiKey();

    return res.status(200).json({
      active: true,
      token_type: "Bearer",
      client_id: record.clientId,
      sub: String(user?._id || record.userId),
      email: user?.email || null,
      scope: (record.scopes || []).join(" "),
      exp: Math.floor(record.accessTokenExpiresAt.getTime() / 1000),
      aud: record.resource || getMcpResourceUrl(),
      mcp_api_key: mcpApiKey,
    });
  } catch (error) {
    console.error("OAuth introspect error:", error);
    return res.status(200).json({ active: false });
  }
};

/**
 * GET /api/oauth/credits — SaaS account wallet for the Claude-connected user
 */
exports.getAccountCredits = async (req, res) => {
  try {
    const token = bearerFromReq(req);
    const record = await findTokenRecord(token);
    if (!record) {
      return res.status(401).json({ error: "invalid_token" });
    }
    const balance = await getBalanceForUser(record.userId);
    return res.status(200).json({
      status: "success",
      creditsRemaining: balance.balance,
      personalCredits: balance.personalCredits,
      poolCredits: balance.poolCredits,
      scope: balance.scope,
      source: "mawsool_account",
    });
  } catch (error) {
    console.error("OAuth getAccountCredits error:", error);
    return res.status(500).json({ error: "server_error", error_description: error.message });
  }
};

// Website morphology (same as revealController / AI query)
const EMAIL_COST = 5;
const PHONE_COST = 20;
const SEARCH_COST = 1; // same base as AI query per lead / MCP search
const FULL_INFO_COST = 1;

function contactMorphologyCost(fields) {
  const parts = String(fields || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const wantsEmail = parts.some((p) => p.includes("email"));
  const wantsPhone = parts.some((p) => p.includes("phone"));
  if (wantsEmail && wantsPhone) return EMAIL_COST + PHONE_COST;
  if (wantsPhone) return PHONE_COST;
  if (wantsEmail) return EMAIL_COST;
  return EMAIL_COST;
}

/**
 * Resolve website morphology for an MCP tool action.
 * MCP must NOT decide prices — only send { action, fields? }.
 */
function morphologyForAction(action, fields) {
  switch (String(action || "").toLowerCase()) {
    case "search":
      return { amount: SEARCH_COST, label: "search" };
    case "contact":
    case "contact-only":
      return {
        amount: contactMorphologyCost(fields),
        label: `contact (${fields || "email"})`,
      };
    case "full-info":
    case "full-info-without-contact":
      return { amount: FULL_INFO_COST, label: "full-info" };
    case "check-credits":
      return { amount: 0, label: "check-credits" };
    default:
      return null;
  }
}

/**
 * POST /api/oauth/charge
 * Body (preferred): { action: "search"|"contact"|"full-info", fields?: string }
 * Website owns morphology. Optional legacy: { amount, description }.
 */
exports.chargeAccountCredits = async (req, res) => {
  try {
    const token = bearerFromReq(req);
    const record = await findTokenRecord(token);
    if (!record) {
      return res.status(401).json({ error: "invalid_token" });
    }

    const action = req.body?.action;
    const fields = req.body?.fields;
    let amount;
    let description;

    if (action) {
      const morph = morphologyForAction(action, fields);
      if (!morph) {
        return res.status(400).json({
          error: "invalid_action",
          error_description: `Unknown action: ${action}`,
        });
      }
      amount = morph.amount;
      description =
        req.body?.description || `MCP/Claude ${morph.label} (website morphology)`;
    } else {
      // legacy numeric charge — kept for safety, not used by MCP
      amount = Number(req.body?.amount);
      description = req.body?.description || "MCP / Claude usage";
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Provide action (preferred) or a positive amount",
        });
      }
    }

    if (amount === 0) {
      const balance = await getBalanceForUser(record.userId);
      return res.status(200).json({
        status: "success",
        charged: 0,
        creditsRemaining: balance.balance,
        scope: balance.scope,
        source: "mawsool_account",
        morphology: "website",
      });
    }

    const before = await getBalanceForUser(record.userId);
    if ((before.balance || 0) < amount) {
      return res.status(402).json({
        error: "insufficient_credits",
        creditsRemaining: before.balance,
        required: amount,
        source: "mawsool_account",
        morphology: "website",
      });
    }

    const deducted = await deductCreditsForUser(
      record.userId,
      amount,
      description
    );

    return res.status(200).json({
      status: "success",
      charged: amount,
      creditsRemaining: deducted.balance,
      scope: deducted.scope,
      source: "mawsool_account",
      morphology: "website",
      action: action || null,
    });
  } catch (error) {
    console.error("OAuth chargeAccountCredits error:", error);
    if (/insufficient/i.test(error.message || "")) {
      return res.status(402).json({
        error: "insufficient_credits",
        error_description: error.message,
        source: "mawsool_account",
      });
    }
    return res.status(500).json({ error: "server_error", error_description: error.message });
  }
};

/**
 * Discovery documents
 */
exports.authorizationServerMetadata = (req, res) => {
  const issuer = getIssuer();
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    // "none" required for Claude CIMD public clients
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: ["mcp", "offline_access", "openid", "email", "profile"],
    revocation_endpoint_auth_methods_supported: ["none"],
    // Claude Directory prefers CIMD over DCR for high traffic
    client_id_metadata_document_supported: true,
  });
};

exports.openidConfiguration = (req, res) => {
  // Alias for clients that probe OIDC discovery
  return exports.authorizationServerMetadata(req, res);
};

exports.protectedResourceMetadata = (req, res) => {
  const issuer = getIssuer();
  const resource = getMcpResourceUrl();
  res.json({
    resource,
    authorization_servers: [issuer],
    scopes_supported: ["mcp", "offline_access"],
    bearer_methods_supported: ["header"],
  });
};
