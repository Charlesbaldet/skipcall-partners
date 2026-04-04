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
const { startNotificationWorker } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 4000;

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Security Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter limit on auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
app.use('/api/auth/', authLimiter);

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Routes Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.use('/api/auth', authRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Error handler Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
});

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Start Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// âââ Auto-init database on startup âââ
const { pool } = require('./db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function autoInit() {
  try {
    // Check if tables exist
    const { rows } = await pool.query("SELECT to_regclass('public.users')");
    if (rows[0].to_regclass) {
      console.log('ð Database already initialized');
      return;
    }
    
    console.log('ð§ Initializing database...');
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('â Schema created');
    
    // Seed data
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const adminHash = await bcrypt.hash('skipcall2026!', 12);
      const { rows: [admin] } = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET password_hash = $2 RETURNING id`,
        ['admin@skipcall.com', adminHash, 'Admin Skipcall', 'admin']
      );
      const comHash = await bcrypt.hash('commercial2026!', 12);
      const { rows: [commercial] } = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET password_hash = $2 RETURNING id`,
        ['commercial@skipcall.com', comHash, 'Thomas Roche', 'commercial']
      );
      const partners = [
        { name: 'TechAlliance', contact: 'Marc Dupont', email: 'marc@techalliance.fr', commission: 10 },
        { name: 'DigiConseil', contact: 'Sophie Martin', email: 'sophie@digiconseil.fr', commission: 12 },
        { name: 'CloudExperts', contact: 'Julien Petit', email: 'julien@cloudexperts.io', commission: 8 },
      ];
      for (const p of partners) {
        const h = await bcrypt.hash('partner2026!', 12);
        const { rows: [partner] } = await client.query(
          `INSERT INTO partners (name, contact_name, email, commission_rate) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET name = $1 RETURNING id`,
          [p.name, p.contact, p.email, p.commission]
        );
        await client.query(
          `INSERT INTO users (email, password_hash, full_name, role, partner_id) VALUES ($1, $2, $3, 'partner', $4) ON CONFLICT (email) DO UPDATE SET partner_id = $4`,
          [p.email, h, p.contact, partner.id]
        );
      }
      await client.query('COMMIT');
      console.log('â Database seeded');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Seed error:', e.message);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Auto-init error:', err.message);
  }
}

app.listen(PORT, async () => {
  await autoInit();
  console.log(`Ã°ÂÂÂ Skipcall API running on port ${PORT}`);
  
  // Start email notification worker (checks queue every 30s)
  if (process.env.SMTP_HOST) {
    startNotificationWorker();
    console.log('Ã°ÂÂÂ§ Email notification worker started');
  }
});
