// Run: node backend/db/run-migration-v4.js
// Or:  node backend/db/run-migration-v4.js "postgresql://..."
//
// Reads migration-v4-user-roles.sql from disk and runs each statement.
// Idempotent - safe to run multiple times.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.argv[2] || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL.');
  console.error('   Set env var: DATABASE_URL=postgresql://... node backend/db/run-migration-v4.js');
  console.error('   or arg:      node backend/db/run-migration-v4.js "postgresql://..."');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Naive splitter on ';' that respects single-quoted strings and line comments.
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let inStr = false;
  let strCh = '';
  let inLineComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLineComment) {
      buf += c;
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inStr) {
      buf += c;
      if (c === strCh && sql[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (c === '-' && n === '-') {
      inLineComment = true;
      buf += c;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = true;
      strCh = c;
      buf += c;
      continue;
    }
    if (c === ';') {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = '';
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function migrate() {
  console.log('Running migration v4 (user_roles)...\n');

  const sqlPath = path.join(__dirname, 'migration-v4-user-roles.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Cannot find migration file at:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = splitStatements(sql);

  console.log(`Found ${statements.length} statements\n`);

  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const label = stmt.split('\n')[0].slice(0, 70);
    try {
      await pool.query(stmt);
      console.log(`  OK   ${i + 1}/${statements.length}  ${label}`);
      okCount++;
    } catch (err) {
      console.error(`  FAIL ${i + 1}/${statements.length}  ${label}`);
      console.error(`       ${err.message}`);
      failCount++;
    }
  }

  console.log(`\nMigration v4 done: ${okCount} ok, ${failCount} failed.`);

  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM user_roles');
    console.log(`user_roles total rows: ${rows[0].n}`);
  } catch (_e) {}

  try {
    const { rows } = await pool.query(`
      SELECT u.email, COUNT(*)::int AS roles_count
      FROM user_roles ur
      JOIN users u ON u.id = ur.user_id
      GROUP BY u.email
      HAVING COUNT(*) > 1
      ORDER BY roles_count DESC, u.email
      LIMIT 10
    `);
    if (rows.length === 0) {
      console.log('No multi-role users yet (expected before /approve gets patched).');
    } else {
      console.log('Users already with multiple roles:');
      rows.forEach(r => console.log(`  ${r.email}: ${r.roles_count} roles`));
    }
  } catch (_e) {}

  await pool.end();
  process.exit(failCount > 0 ? 1 : 0);
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  pool.end();
  process.exit(1);
});
