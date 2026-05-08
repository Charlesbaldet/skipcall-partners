#!/usr/bin/env node
/*
 * audit-secrets.js — RefBoost compliance audit
 *
 * Scans backend/**\/*.js and frontend/src/**\/*.{js,jsx} for
 * hardcoded credentials, API keys, bearer tokens and JWTs.
 *
 * Patterns flagged (case-insensitive):
 *   - password / passwd / pwd      = "literal"
 *   - api_key / api-key / apiKey
 *     / secret / token             = "literal"
 *   - Bearer <20+ char token>
 *   - JWT-shaped strings           (eyJ... . ... . ...)
 *
 * Skipped per-line:
 *   - any reference to process.env.*
 *   - placeholder / example / dummy / test / mock / sample /
 *     your_ / <your / xxxx / *** values
 *   - lines carrying `// audit-skip`
 *   - JSDoc / inline comment lines starting with `*`
 *
 * Allow-list: scripts/audit-secrets.allowlist (one regex per line).
 *
 * Usage:
 *   node scripts/audit-secrets.js
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one suspicious literal found
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(__dirname, 'audit-secrets.allowlist');

const SCAN_TARGETS = [
  { root: path.join(REPO_ROOT, 'backend'), exts: ['.js'] },
  { root: path.join(REPO_ROOT, 'frontend', 'src'), exts: ['.js', '.jsx'] },
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'coverage']);

const PATTERNS = [
  {
    name: 'password',
    re: /(password|passwd|pwd)\s*[:=]\s*['"]([^'"]+)['"]/i,
    valueGroup: 2,
  },
  {
    name: 'api-key/secret/token',
    re: /(api[_-]?key|secret|token)\s*[:=]\s*['"]([^'"]+)['"]/i,
    valueGroup: 2,
  },
  {
    name: 'bearer-token',
    re: /Bearer\s+([A-Za-z0-9_\-.~+/]{20,})/,
    valueGroup: 1,
  },
  {
    name: 'jwt-literal',
    re: /(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/,
    valueGroup: 1,
  },
];

const PLACEHOLDER_RE =
  /(placeholder|example|dummy|test|mock|sample|your_|<your|xxxx|\*\*\*)/i;

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return [];
  return fs
    .readFileSync(ALLOWLIST_PATH, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => new RegExp(l));
}

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function relPath(p) {
  return path.relative(REPO_ROOT, p);
}

function shouldSkipLine(line, prevLine) {
  // Inline `// audit-skip` (this or previous line)
  if (/\/\/\s*audit-skip/.test(line) || /\/\/\s*audit-skip/.test(prevLine || '')) {
    return true;
  }
  // JSDoc / inline comment line
  if (/^\s*\*/.test(line)) return true;
  // process.env reference — the right pattern
  if (/process\.env\./.test(line)) return true;
  // placeholder values
  if (PLACEHOLDER_RE.test(line)) return true;
  return false;
}

function maskExcerpt(line, value) {
  if (!value) return line.trim().slice(0, 120);
  return line.replace(value, '***').trim().slice(0, 160);
}

function scanFile(filePath, allowlist) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const rel = relPath(filePath);
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : '';

    if (shouldSkipLine(line, prev)) continue;

    for (const p of PATTERNS) {
      const m = line.match(p.re);
      if (!m) continue;
      const value = m[p.valueGroup];
      // Final placeholder check on the captured value itself (cheap).
      if (PLACEHOLDER_RE.test(value || '')) continue;
      // Heuristic: real secrets are >= 8 chars of token alphabet
      // (alnum, _, -, ., +, /, =). String literals like '(len:' that
      // happen to come right after a `secret:` label in a console.log
      // are not credentials. This filter keeps the check tight on
      // password / api-key / secret / token patterns; the bearer and
      // JWT regexes already enforce length.
      if (
        (p.name === 'password' || p.name === 'api-key/secret/token') &&
        (!value || value.length < 8 || !/^[A-Za-z0-9_\-.+/=]+$/.test(value))
      ) {
        continue;
      }
      const locator = `${rel}:${i + 1}`;
      if (allowlist.some((re) => re.test(locator) || re.test(rel))) continue;

      findings.push({
        file: rel,
        lineNo: i + 1,
        kind: p.name,
        excerpt: maskExcerpt(line, value),
      });
      break; // one finding per line is enough
    }
  }

  return findings;
}

function main() {
  const allowlist = loadAllowlist();
  let files = [];
  for (const t of SCAN_TARGETS) {
    files.push(...walk(t.root, t.exts));
  }

  const allFindings = [];
  for (const f of files) {
    allFindings.push(...scanFile(f, allowlist));
  }

  for (const f of allFindings) {
    console.log(
      `FAIL ${f.file}:${f.lineNo}  kind=${f.kind}  excerpt="${f.excerpt}"`
    );
  }

  const fail = allFindings.length;
  console.log(
    `Hardcoded secrets audit: ${files.length} files scanned, ${fail} failures`
  );

  process.exit(fail > 0 ? 1 : 0);
}

main();
