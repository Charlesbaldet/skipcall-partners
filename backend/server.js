require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const partnerRoutes = require('./routes/partners');
const referralRoutes = require('./routes/referrals');
const commissionRoutes = require('./routes/commissions');
const dashboardRoutes = require('./routes/dashboard');
const messageRoutes = require('./routes/messages');
const applicationRoutes = require('./routes/applications');
const adminRoutes = require('./routes/admin');
const { startNotificationWorker } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security ───
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
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

// ─── Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error handler ───
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
  console.log(`🚀 Skipcall API running on port ${PORT}`);
  if (process.env.SMTP_HOST) {
    startNotificationWorker();
    console.log('📧 Email notification worker started');
  }
});
