const crypto = require('crypto');

// Tags every request with a UUID so a single user action can be
// correlated across services, log lines, and the optional Slack
// webhook fired from the global error handler. Trusts an inbound
// x-request-id header if the caller already set one (Vercel /
// Cloudflare forward this for tracing) — otherwise mints a fresh
// UUID. The id is echoed back as a response header so the client
// can include it in support tickets.
module.exports = function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};
