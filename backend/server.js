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
const openapiRoutes = require('./routes/openapi');
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
const dashboardStatsRoutes = require('./routes/dashboardStats');

// Services & middleware
const { startNotificationWorker } = require('./services/emailService');
const { runMigrations } = require('./db/migrate');
const { runSecurityMigrations } = require('./db/migrate-security');
const { tenantMiddleware } = require('./middleware/tenant');
const { securityHeaders, auditLog, cleanupOldData } = require('./middleware/security');

const app = express();

// Trust Railway's proxy (fixes express-rate-limit X-Forwarded-For error)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;

// ─── Security Headers (ISO 27001 A.13.1) ───
app.use(securityHeaders);
app.use(helmet());

// ─── CORS ───
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:3000',
    ];
    // Allow all Vercel preview deployments for the project
    const isVercelPreview = origin && origin.endsWith('.vercel.app');
    if (allowed.includes(origin) || isVercelPreview) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true,
}));

// Stripe webhook needs the raw body for signature verification, so it
// MUST be mounted BEFORE express.json(). Everything else below gets the
// usual parsed JSON body.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

app.use(express.json({ limit: '1mb' }));

// ─── Rate limiting ───
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
app.use('/api/auth/', authLimiter);

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
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/dashboard', dashboardStatsRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/v1', openapiRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/levels', levelsRoutes);
app.use('/api/track', trackingRoutes);
// Features endpoint MUST mount before the generic tenants router — the
// latter defines PUT /:id which would otherwise swallow /features as
// if "features" were a tenant UUID (and reject with 403).
app.use('/api/tenants', tenantFeaturesRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/super-admin', superadminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error handler ───
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
app.use('/api/pipeline-stages', pipelineStagesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', sitemapRoutes);
app.use('/api/referral-links', referralLinksRoutes);
app.use('/api/promo-codes', promoCodesRoutes);
app.use('/api/tracking', trackingScriptRoutes);
app.use('/api/partner-categories', partnerCategoriesRoutes);
// Public referral-link short URL (mounted at app root, not /api).
// Vercel rewrites /r/:path* to this service.
app.use('/r', referralRedirectRoutes);
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ─── Start ───
app.listen(PORT, () => {
  runMigrations();
  runSecurityMigrations();

  // Cleanup old data every 24h (ISO 27001 A.12.4)
  setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
  setTimeout(cleanupOldData, 60000); // First cleanup after 1 min

  console.log(`🚀 Skipcall API running on port ${PORT}`);

  if (process.env.SMTP_HOST) {
    startNotificationWorker();
    console.log('📧 Email notification worker started');
  }
});

// force rebuild
