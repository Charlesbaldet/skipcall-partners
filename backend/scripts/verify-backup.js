#!/usr/bin/env node
/**
 * Backup verification — run manually (or from a scheduler) to spot-
 * check the live database. Railway native backups are configured
 * separately via the Railway dashboard / API token; this script does
 * NOT attempt to fetch backup metadata.
 *
 * What it checks:
 *   - The DB is reachable on $DATABASE_URL.
 *   - Every business-critical table returns a non-zero row count.
 *     Zero is the truncation sentinel — RefBoost is multi-tenant SaaS
 *     and a healthy production DB never has zero tenants/users/etc.
 *
 * Usage:
 *   DATABASE_URL=postgres://… node backend/scripts/verify-backup.js
 *   npm run verify-backup --prefix backend
 *
 * Exit codes:
 *   0  every table non-empty
 *   1  one or more tables empty (probable truncation / restore issue)
 *   2  could not connect / unexpected runtime error
 *
 * Output is JSON on stdout so a cron consumer can pipe it through jq.
 */

require('dotenv').config();
const { Client } = require('pg');

// Tables we expect to be non-empty in any healthy production tenant.
// audit_logs is opportunistic — it ships in migrate-security.js so a
// brand-new instance might genuinely have 0 rows. We probe for the
// table first and only count it when present.
const REQUIRED_TABLES = [
  'tenants',
  'users',
  'partners',
  'referrals',
  'commissions',
  'conversations',
  'messages',
  'news_posts',
];
const OPTIONAL_TABLES = ['audit_logs'];

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = $1
     ) AS present`,
    [name]
  );
  return rows[0]?.present === true;
}

async function countRows(client, name) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${name}`);
  return rows[0]?.n ?? 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'DATABASE_URL not set' }) + '\n');
    process.exit(2);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  const report = {
    ok: true,
    timestamp: new Date().toISOString(),
    checks: {},
    failures: [],
  };

  try {
    await client.connect();
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'connect failed: ' + e.message }) + '\n');
    process.exit(2);
  }

  for (const table of REQUIRED_TABLES) {
    try {
      const n = await countRows(client, table);
      report.checks[table] = n;
      if (n === 0) {
        report.ok = false;
        report.failures.push(`${table} is empty`);
      }
    } catch (e) {
      report.ok = false;
      report.checks[table] = { error: e.message };
      report.failures.push(`${table} query failed: ${e.message}`);
    }
  }

  for (const table of OPTIONAL_TABLES) {
    try {
      if (await tableExists(client, table)) {
        report.checks[table] = await countRows(client, table);
      } else {
        report.checks[table] = 'absent';
      }
    } catch (e) {
      report.checks[table] = { error: e.message };
    }
  }

  await client.end();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(report.ok ? 0 : 1);
}

main().catch(err => {
  process.stdout.write(JSON.stringify({ ok: false, error: err.message }) + '\n');
  process.exit(2);
});
