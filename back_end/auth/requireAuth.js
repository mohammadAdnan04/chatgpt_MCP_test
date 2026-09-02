// auth/requireAuth.js
const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  const token = req.cookies?.['auth-token'];
  if (!token) return res.status(401).json({ error: 'unauthenticated' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
};
