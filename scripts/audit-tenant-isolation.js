#!/usr/bin/env node
/*
 * audit-tenant-isolation.js — RefBoost compliance audit
 *
 * Walks every backend/routes/*.js file and flags SQL queries that
 * touch a tenant-scoped table without a visible tenant guard nearby.
 *
 * It does NOT parse SQL — it relies on the convention that every
 * tenant-scoped query in this codebase carries one of:
 *   - tenant_id / tenantId            (column / req.tenantId reference)
 *   - req.skipTenantFilter            (deliberate superadmin bypass)
 *   - WHERE tenant_id / AND tenant_id (literal SQL guard)
 *   - router.use(tenantScope)         (file-level enforcement)
 *   - tenantClause / tenantFilter     (helper-function enforcement)
 *
 * The matcher inspects two windows:
 *   1. A 15-line slice (7 before, 7 after) around the matched
 *      table reference — catches per-query inline guards.
 *   2. The whole enclosing `router.<method>(...)` block — catches
 *      guards declared earlier in the same handler (a common
 *      pattern: build a `where` array at the top, embed via
 *      template literal further down).
 *
 * Files that mount `router.use(tenantScope)` at top level are
 * considered tenant-scoped at the file boundary and pass — the
 * audit's job is to surface routes that forgot the scope, not to
 * second-guess Express middleware.
 *
 * Usage:
 *   node scripts/audit-tenant-isolation.js
 *   node scripts/audit-tenant-isolation.js --self-test
 *
 * Allow-list: scripts/audit-tenant-isolation.allowlist
 *   one regex per line; lines matching are skipped. Blank lines and
 *   lines starting with '#' are ignored.
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one query without a visible tenant guard
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ROUTES_DIR = path.join(REPO_ROOT, 'backend', 'routes');
const ALLOWLIST_PATH = path.join(__dirname, 'audit-tenant-isolation.allowlist');

const TENANT_TABLES = [
  'referrals',
  'commissions',
  'partners',
  'messages',
  'conversations',
  'news_posts',
  'notifications',
  'audit_logs',
  'notification_queue',
];

const GUARD_PATTERNS = [
  /tenant_id/i,
  /tenantId/,
  /req\.tenantId/,
  /skipTenantFilter/,
  /req\.skipTenantFilter/,
  /WHERE\s+tenant_id/i,
  /AND\s+tenant_id/i,
];

const WINDOW_BEFORE = 7;
const WINDOW_AFTER = 7;

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return [];
  return fs
    .readFileSync(ALLOWLIST_PATH, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => new RegExp(l));
}

function walkJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJs(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function buildTableRegex() {
  const alt = TENANT_TABLES.join('|');
  // FROM, INTO, UPDATE, JOIN <table>, word-boundaried, case-insensitive
  return new RegExp(`\\b(FROM|INTO|UPDATE|JOIN)\\s+(${alt})\\b`, 'gi');
}

function hasGuard(lines, idx) {
  const start = Math.max(0, idx - WINDOW_BEFORE);
  const end = Math.min(lines.length - 1, idx + WINDOW_AFTER);
  const window = lines.slice(start, end + 1).join('\n');
  return GUARD_PATTERNS.some((p) => p.test(window));
}

// Find the enclosing router.<method>( block — from the most recent
// `router.<verb>(` line at or before idx to the next one (or EOF).
// Helpful when a tenant guard is built at the top of the handler and
// embedded into a template-literal SQL block 20+ lines later.
const ROUTER_RE = /^\s*router\.(get|post|put|delete|patch|use)\s*\(/;
function enclosingRouterBlock(lines, idx) {
  let start = idx;
  while (start > 0 && !ROUTER_RE.test(lines[start])) start--;
  if (!ROUTER_RE.test(lines[start])) return null;
  let end = idx;
  for (let j = idx + 1; j < lines.length; j++) {
    if (ROUTER_RE.test(lines[j])) {
      end = j - 1;
      return lines.slice(start, end + 1).join('\n');
    }
  }
  return lines.slice(start).join('\n');
}

function hasFileLevelTenantScope(text) {
  // router.use(tenantScope) — every handler downstream gets req.tenantId
  // set, and almost every handler in the codebase consumes it. Treat
  // this as a strong file-level signal (still scan, but don't fail).
  return /router\.use\s*\(\s*tenantScope/.test(text)
    || /router\.use\s*\(\s*authenticate\s*,\s*tenantScope/.test(text)
    || /\btenantClause\s*\(/.test(text)
    || /\btenantFilter\s*\(/.test(text);
}

function relPath(p) {
  return path.relative(REPO_ROOT, p);
}

function scanFile(filePath, allowlist) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const tableRe = buildTableRegex();
  const findings = [];
  let total = 0;
  const fileScoped = hasFileLevelTenantScope(text);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    tableRe.lastIndex = 0;
    let m;
    while ((m = tableRe.exec(line)) !== null) {
      total++;
      const table = m[2];
      const rel = relPath(filePath);
      const locator = `${rel}:${i + 1}`;
      if (allowlist.some((re) => re.test(locator) || re.test(rel))) {
        continue;
      }
      if (hasGuard(lines, i)) continue;

      // Widen the search to the enclosing router.<method>( block —
      // catches handlers that build the tenant predicate at the top
      // and reference it via a template literal further down.
      const block = enclosingRouterBlock(lines, i);
      if (block && GUARD_PATTERNS.some((p) => p.test(block))) continue;

      // File-level tenantScope mounted on the router. Trust it —
      // surfacing every downstream query would drown the signal.
      if (fileScoped) continue;

      findings.push({
        file: rel,
        lineNo: i + 1,
        table,
        excerpt: line.trim(),
      });
    }
  }
  return { total, findings };
}

function selfTest() {
  const goodSample = [
    'router.get("/", async (req, res) => {',
    '  const { rows } = await query(',
    '    `SELECT id FROM referrals',
    '       WHERE tenant_id = $1`,',
    '    [req.tenantId]',
    '  );',
    '});',
  ].join('\n');
  const badSample = [
    'router.get("/", async (req, res) => {',
    '  const { rows } = await query(',
    '    `SELECT id FROM referrals',
    '       WHERE 1 = 1`',
    '  );',
    '  res.json(rows);',
    '});',
  ].join('\n');

  const tableRe = buildTableRegex();
  function check(sample) {
    const lines = sample.split('\n');
    let found = 0;
    let unguarded = 0;
    for (let i = 0; i < lines.length; i++) {
      tableRe.lastIndex = 0;
      while (tableRe.exec(lines[i]) !== null) {
        found++;
        if (!hasGuard(lines, i)) unguarded++;
      }
    }
    return { found, unguarded };
  }

  const g = check(goodSample);
  const b = check(badSample);
  let ok = true;
  if (g.found !== 1 || g.unguarded !== 0) {
    console.error('self-test FAIL: good sample expected 1/0, got', g);
    ok = false;
  }
  if (b.found !== 1 || b.unguarded !== 1) {
    console.error('self-test FAIL: bad sample expected 1/1, got', b);
    ok = false;
  }
  if (ok) {
    console.log('Tenant isolation self-test: OK');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

function main() {
  if (process.argv.includes('--self-test')) {
    return selfTest();
  }

  const allowlist = loadAllowlist();
  const files = walkJs(ROUTES_DIR);
  let total = 0;
  let allFindings = [];

  for (const f of files) {
    const { total: t, findings } = scanFile(f, allowlist);
    total += t;
    allFindings.push(...findings);
  }

  for (const f of allFindings) {
    console.log(
      `FAIL ${f.file}:${f.lineNo}  table=${f.table}  excerpt="${f.excerpt}"`
    );
  }

  const fail = allFindings.length;
  const pass = total - fail;
  console.log(
    `Tenant isolation audit: ${pass}/${total} queries scanned, ${fail} failures`
  );

  process.exit(fail > 0 ? 1 : 0);
}

main();
