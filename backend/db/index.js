const { Pool } = require('pg');

// Railway hobby tier caps PostgreSQL near ~20 concurrent connections,
// shared with whatever else hits the DB (sidecar, workers, manual
// psql sessions). The earlier `max: 20` left zero headroom — and
// without a `min`, the pool cold-started from 0 connections so every
// burst paid the ~200 ms TLS handshake on the first request.
//
// Tuned for the load profile from the audit:
//   min                    : warm-pool floor; covers steady-state
//                            without spawning new sockets every burst.
//   max                    : leaves 5+ connections free for the rest
//                            of the platform under Railway's cap.
//   idleTimeoutMillis      : 60 s — long enough to absorb traffic
//                            ripples, short enough that a daytime →
//                            overnight transition releases sockets.
//   connectionTimeoutMillis: unchanged at 2 s (fail-fast on outage).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  min: 5,
  max: 15,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Helper for single queries
const query = (text, params) => pool.query(text, params);

// Helper for transactions
const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
