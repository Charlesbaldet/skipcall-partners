require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { query } = require('./db');

// Routes
const authRoutes = require('./routes/auth');
const partnerRoutes = require('./routes/partners');
const referralRoutes = require('./routes/referrals');
const commissionRoutes = require('./routes/commissions');
const dashboardRoutes = require('./routes/dashboard');
const messageRoutes = require('./routes/messages');
const applicationRoutes = require('./routes/applications');
const adminRoutes = require('./routes/admin');
const publicApiRoutes = require('./routes/publicApi');
const leaderboardRoutes = require('./routes/leaderboard');
const levelsRoutes = require('./routes/levels');
const trackingRoutes = require('./routes/tracking');
const tenantRoutes = require('./routes/tenants');
const superadminRoutes = require('./routes/superadmin');
const blogRoutes = require('./routes/blog');
const marketplaceRoutes = require('./routes/marketplace');
const newsRoutes = require('./routes/news');
const { partnerRouter: newsPartnerRoutes, programRouter: newsProgramRoutes } = newsRoutes;
const notificationsRoutes = require('./routes/notifications');
const notificationPrefsRoutes = require('./routes/notificationPrefs');
const { router: billingRoutes } = require('./routes/billing');
const stripeWebhookRoutes = require('./routes/stripeWebhook');
const crmRoutes = require('./routes/crm');
const pipelineStagesRoutes = require('./routes/pipeline-stages');
const searchRoutes = require('./routes/search');
const sitemapRoutes = require('./routes/sitemap');
const tenantFeaturesRoutes = require('./routes/tenantFeatures');
const referralLinksRoutes = require('./routes/referralLinks');
const promoCodesRoutes = require('./routes/promoCodes');
const trackingScriptRoutes = require('./routes/trackingScript');
const partnerCategoriesRoutes = require('./routes/partnerCategories');
const referralRedirectRoutes = require('./routes/referralRedirect');
const notionRoutes = require('./routes/notion');
const partnerNotificationPrefsRoutes = require('./routes/partnerNotificationPrefs');
const partnerBankInfoRoutes = require('./routes/partnerBankInfo');
const partnerDataExportRoutes = require('./routes/partnerDataExport');
const qontoRoutes = require('./routes/qonto');
const dashboardStatsRoutes = require('./routes/dashboardStats');
const webhooksRoutes = require('./routes/webhooks');
const trashRoutes = require('./routes/trash');
const { purgeDeletedRecords } = require('./routes/trash');
const onboardingRoutes = require('./routes/onboarding');
const pennylaneRoutes = require('./routes/pennylane');
const auditLogsRoutes = require('./routes/auditLogs');
const complianceRoutes = require('./routes/compliance');

// Services & middleware
const { startNotificationWorker } = require('./services/emailService');
const { startRetryWorker: startWebhookRetryWorker } = require('./services/webhookService');
const { startScheduledPullWorker: startNotionNightlyPull } = require('./services/notionService');
const { runMigrations } = require('./db/migrate');
const { runSecurityMigrations } = require('./db/migrate-security');
const { tenantMiddleware } = require('./middleware/tenant');
const { securityHeaders, auditLog, cleanupOldData } = require('./middleware/security');
const requestId = require('./middleware/requestId');
const logger = require('./services/logger');

const app = express();

// Trust Railway's proxy (fixes express-rate-limit X-Forwarded-For error)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;

// ─── Request ID (must be first) ───
// Tags every request with a UUID so structured logs and the 5xx
// alerting webhook can correlate a single user action across log
// lines. Must run before auth, rate limiters, tenant middleware
// because we want even 429s and 401s to carry an id.
app.use(requestId);

// ─── Security Headers (ISO 27001 A.13.1) ───
app.use(securityHeaders);
// Default helmet covers X-Frame-Options / X-Content-Type-Options /
// HSTS / Referrer-Policy. CSP is configured explicitly because the
// default policy blocks inline styles (we use inline style props
// liberally) and the Google Fonts + GA + Stripe origins we depend
// on. The directives below are tight: third-party requests are
// limited to the four hosts we actually call. `connect-src` lists
// the Railway API origin so a future fetch hardcoded to its full
// URL doesn't get blocked.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        'https://www.googletagmanager.com',
        'https://js.stripe.com',
        'https://accounts.google.com',
        // 'unsafe-inline' is needed for the GA inline bootstrap in
        // index.html. Removing it would require a nonce + rewriting
        // the bootstrap snippet — a separate refactor.
        "'unsafe-inline'",
      ],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      connectSrc: [
        "'self'",
        'https://skipcall-partners-production.up.railway.app',
        'https://www.google-analytics.com',
        'https://api.stripe.com',
      ],
      frameSrc: ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// ─── CORS ───
// Strict allow-list. The previous `*.vercel.app` wildcard let any
// preview deployment (including ones from forks / unrelated Vercel
// projects in the same DNS namespace) call the prod API with
// credentials, which is a tenant-data exposure path. Preview builds
// that need API access set CORS_PREVIEW_ORIGIN to their full
// origin (e.g. CORS_PREVIEW_ORIGIN=https://refboost-feat-x.vercel.app)
// so the allow-list stays explicit per-deploy.
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = [
      process.env.FRONTEND_URL,
      process.env.CORS_PREVIEW_ORIGIN,
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean);
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true,
}));

// Stripe webhook needs the raw body for signature verification, so it
// MUST be mounted BEFORE express.json(). Everything else below gets the
// usual parsed JSON body. Also mounted BEFORE the tenant middleware and
// rate limiter so neither can interfere with Stripe's retries.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes);
console.log('[startup] Stripe webhook route registered at /api/webhooks/stripe');

// Invoice uploads on /api/commissions/:id/upload-invoice send the PDF as
// a base64 data URL inside JSON, so the global limit needs to fit a
// reasonably-sized invoice (~10MB raw → ~14MB base64).
app.use(express.json({ limit: '15mb' }));

// ─── Health / status (mounted BEFORE rate limiters + auth) ───
// Public liveness probe used by Railway, the StatusPage poller, and
// any external uptime checker. Mounting it ahead of express-rate-limit
// keeps the probe reachable even when the API is hot — the worst-case
// is a flood of /api/health hits, which is just a SELECT 1 + a
// memoryUsage() call.
app.use('/api/health', require('./routes/health'));

// ─── Rate limiting ───
// General limiter: 600 req / 15 min / IP. Sized for a real admin
// session (Layout fires ~6 mount fetches, SuperAdmin page does
// Promise.all of 5+ endpoints, every navigation reissues ~3-5
// requests). Previous ceiling of 100 was exhausted in minutes by
// any active admin. Still tight enough to stop a naive scraper.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Brute-force protection: 20 req / 15 min / IP, mounted ONLY on
// /auth/login + /auth/signup (the credential-checking entry points).
// Other /auth/* endpoints (me, me/spaces, switch-space, mfa, etc.)
// are session-management calls hit repeatedly during normal use and
// fall back under the general limiter above. Previously this limiter
// covered the entire /api/auth/ prefix which choked Layout + multi-
// tenant switching for active admins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/signup', loginLimiter);

// Tighter limiter on the password-reset surface. Both forgot-password
// (email enumeration) and reset-password (token brute-force) need a
// ceiling well below the 20/15min auth limiter — 5/hour per IP makes
// enumeration impractical without breaking legitimate users who
// occasionally retry. Mounted BEFORE the auth router so its middleware
// chain hits first.
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/forgot-password', passwordResetLimiter);
app.use('/api/auth/reset-password', passwordResetLimiter);

// ─── Tenant middleware (White-label) ───
app.use('/api/', tenantMiddleware);

// ─── Routes ───

// ─── Analytics tracking (no auth) ───
app.post('/api/analytics/track', (req, res) => {
  const { event, url, ref, depth, label } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });
  console.log('[ANALYTICS]', new Date().toISOString(), event, url || '', label ? 'label=' + label : '', depth ? 'depth=' + depth + '%' : '');
  try { query("INSERT INTO analytics_events (event, url, referrer, user_agent, metadata, created_at) VALUES ($1, $2, $3, $4, $5, NOW())", [event, url, ref, req.body.ua, JSON.stringify({ depth, label, ts: req.body.ts })]).catch(() => {}); } catch(e) {}
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/dashboard', dashboardStatsRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/v1', publicApiRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/levels', levelsRoutes);
app.use('/api/track', trackingRoutes);
// Features endpoint MUST mount before the generic tenants router — the
// latter defines PUT /:id which would otherwise swallow /features as
// if "features" were a tenant UUID (and reject with 403).
app.use('/api/tenants', tenantFeaturesRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/super-admin', superadminRoutes);

app.use('/api/blog', blogRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings/notification-preferences', notificationPrefsRoutes);
app.use('/api/partner/news', newsPartnerRoutes);
app.use('/api/partner/program', newsProgramRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/crm/notion', notionRoutes);
app.use('/api/partner/notification-preferences', partnerNotificationPrefsRoutes);
app.use('/api/partner/bank-info', partnerBankInfoRoutes);
app.use('/api/partner/export-data', partnerDataExportRoutes);
app.use('/api/integrations/qonto', qontoRoutes);
app.use('/api/pipeline-stages', pipelineStagesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', sitemapRoutes);
app.use('/api/referral-links', referralLinksRoutes);
app.use('/api/promo-codes', promoCodesRoutes);
app.use('/api/tracking', trackingScriptRoutes);
app.use('/api/partner-categories', partnerCategoriesRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/pennylane', pennylaneRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/admin/compliance', complianceRoutes);
app.use('/api/forms', require('./routes/forms'));
// Public form endpoints (no auth). Mounted at /api/f to match the
// public URL pattern /f/:formId the partners share.
app.use('/api/f', require('./routes/formsPublic'));
// Public referral-link short URL (mounted at app root, not /api).
// Vercel rewrites /r/:path* to this service.
app.use('/r', referralRedirectRoutes);
// ─── Global error handler (LAST middleware) ───
// Logs every unhandled error with structured context, and best-effort
// fires a Slack-compatible webhook on 5xx so on-call gets paged. 4xx
// errors stay silent — they're typically validation noise the user
// will see and correct on their own. We never include req.body in the
// webhook because that body may carry PII or partial credentials.
app.use((err, req, res, next) => {
  const status = err.status || 500;

  logger.error('Unhandled error', {
    requestId: req?.requestId,
    tenantId: req?.user?.tenantId,
    method: req?.method,
    path: req?.path,
    status,
    error: err.message,
    stack: err.stack,
  });

  if (status >= 500 && process.env.ERROR_WEBHOOK_URL) {
    fetch(process.env.ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 RefBoost Error: ${err.message}\nRoute: ${req.method} ${req.path}\nTenant: ${req.user?.tenantId || 'anonymous'}\nRequest ID: ${req.requestId || '-'}`,
      }),
    }).catch(() => {});
  }

  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    request_id: req?.requestId,
  });
});

// ─── Start ───
app.listen(PORT, () => {
  logger.info('API server starting', { port: PORT, version: process.env.RAILWAY_GIT_COMMIT_SHA?.substring(0, 7) || 'dev' });

  // Migrations are fire-and-forget so the server can start serving
  // requests immediately. The migrate functions already catch their
  // own errors per-block; the .catch() here is the last-resort safety
  // net against any unhandled rejection (Node >=15 would otherwise
  // terminate the process by default).
  runMigrations().catch(err => logger.error('runMigrations crashed', { error: err && err.message }));
  runSecurityMigrations().catch(err => logger.error('runSecurityMigrations crashed', { error: err && err.message }));

  // Stale Qonto state cleanup — runs on every deploy. Uses
  // RETURNING id so the log line names the rows we touched, which
  // is the only way to confirm the cleanup actually fired in Railway
  // logs. Reaches every non-paid / non-awaiting-invoice commission
  // that's carrying a payment_error OR a non-zero retry counter so
  // a row stuck mid-replay also gets reset, not just the obvious
  // error rows.
  (async () => {
    try {
      const result = await query(`
        UPDATE commissions
           SET payment_error = NULL,
               qonto_transfer_id = NULL,
               qonto_attachment_id = NULL,
               payment_initiated_at = NULL,
               payment_completed_at = NULL,
               qonto_sca_session_token = NULL,
               qonto_vop_proof_token = NULL,
               qonto_idempotency_key = NULL,
               qonto_request_body = NULL,
               qonto_retry_count = 0,
               status = 'pending_validation'
         WHERE status NOT IN ('paid', 'awaiting_invoice')
           AND (payment_error IS NOT NULL OR COALESCE(qonto_retry_count, 0) > 0)
         RETURNING id
      `);
      if (result.rowCount > 0) {
        logger.info('startup.cleanup reset stuck commissions', { count: result.rowCount, ids: result.rows.map(r => r.id) });
      } else {
        logger.info('startup.cleanup no stuck commissions');
      }
    } catch (e) {
      logger.error('startup.cleanup failed', { error: e.message });
    }
  })();

  // Cleanup old data every 24h (ISO 27001 A.12.4)
  setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
  setTimeout(cleanupOldData, 60000); // First cleanup after 1 min

  // Daily retention purge — fires at 03:00 UTC. Hard-deletes
  // soft-deleted partners/referrals/commissions older than 30 days,
  // anonymises old users, and trims audit_logs/notification_queue.
  // SOC 2 CC6.5 / ISO 27001 A.18.1.3.
  try {
    const { scheduleRetentionPurge } = require('./scripts/retention-purge');
    scheduleRetentionPurge();
  } catch (err) {
    logger.error('retention scheduler failed to arm', { error: err && err.message });
  }

  // Purge soft-deleted referrals + commissions older than 30 days.
  // Same cadence as cleanupOldData; first run delayed +2 min so the
  // boot sequence isn't overloaded.
  const tickPurge = () => purgeDeletedRecords().catch(e => logger.error('trash.purge tick error', { error: e.message }));
  setTimeout(tickPurge, 2 * 60 * 1000);
  setInterval(tickPurge, 24 * 60 * 60 * 1000);

  logger.info('Skipcall API running', { port: PORT });

  if (process.env.SMTP_HOST) {
    startNotificationWorker();
    logger.info('Email notification worker started');
  }

  startWebhookRetryWorker();
  logger.info('webhooks retry worker started');

  // Nightly bi-directional-sync pull for Notion. Wakes at 21:00
  // Europe/Paris, iterates every active Notion integration, and
  // fetches the delta since each tenant's last_pull_at watermark.
  startNotionNightlyPull();

  // Qonto transfer polling — every 5 minutes the worker sweeps every
  // commission with a qonto_transfer_id but no payment_completed_at,
  // asks Qonto for the current status, and finalizes the ones Qonto
  // marks as completed (status → 'paid' + proof-of-payment email).
  // Qonto webhooks aren't yet wired so polling is the source of truth.
  if (process.env.QONTO_CLIENT_ID) {
    const { reconcileQontoTransfers } = require('./routes/commissions');
    const tick = () => reconcileQontoTransfers(null).catch(e => logger.error('qonto.poll tick error', { error: e.message }));
    setTimeout(tick, 30_000);          // first sweep ~30 s after boot
    setInterval(tick, 5 * 60 * 1000);  // then every 5 min
    logger.info('qonto transfer polling worker started');
  }
});

// force rebuild
