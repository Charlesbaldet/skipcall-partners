#!/usr/bin/env node
/*
 * audit-auth-middleware.js — RefBoost compliance audit
 *
 * Walks every backend/routes/*.js file and flags HTTP handlers that
 * forgot to require an authentication middleware.
 *
 * Pass conditions for a `router.<method>(...)` call:
 *   - `authenticate` appears in the call (within the same line or
 *     within the next 5 lines for multi-line declarations), OR
 *   - `apiKeyAuth` appears (the public-API alternative), OR
 *   - the file is in the public-route allow-list
 *     (`scripts/audit-auth-middleware.allowlist`), OR
 *   - the call carries `// audit-skip` on the same or previous line.
 *
 * The matcher also accepts file-level `router.use(authenticate)` /
 * `router.use(apiKeyAuth)` declarations — every handler downstream
 * inherits the middleware and is treated as protected.
 *
 * Usage:
 *   node scripts/audit-auth-middleware.js
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one unauthenticated route outside the allow-list
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ROUTES_DIR = path.join(REPO_ROOT, 'backend', 'routes');
const ALLOWLIST_PATH = path.join(__dirname, 'audit-auth-middleware.allowlist');

const ROUTER_CALL_RE = /\brouter\.(get|post|put|delete|patch)\s*\(/g;
const ROUTER_USE_AUTH_RE =
  /router\.use\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?(?:authenticate|apiKeyAuth)\b/;
const CONTINUATION_LINES = 5;

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return [];
  return fs
    .readFileSync(ALLOWLIST_PATH, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function walkJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function relPath(p) {
  return path.relative(REPO_ROOT, p);
}

// Extract the route path argument from `router.X('/foo', ...)`.
function extractRoutePath(line) {
  const m = line.match(/router\.\w+\s*\(\s*(['"`])([^'"`]*)\1/);
  return m ? m[2] : '';
}

function scanFile(filePath, allowlist) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const rel = relPath(filePath);

  // File-level allow-list (path prefix substring match).
  const fileAllowed = allowlist.some((entry) => rel.includes(entry));

  // Detect file-level router.use(authenticate) / router.use(apiKeyAuth).
  // If present, treat every router.<verb>() in this file as protected.
  const fileLevelAuth = lines.some((l) => ROUTER_USE_AUTH_RE.test(l));

  const findings = [];
  let total = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    ROUTER_CALL_RE.lastIndex = 0;
    if (!ROUTER_CALL_RE.test(line)) continue;
    total++;

    if (fileAllowed) continue;
    if (fileLevelAuth) continue;

    // // audit-skip on same or previous line
    const prev = i > 0 ? lines[i - 1] : '';
    if (/\/\/\s*audit-skip/.test(line) || /\/\/\s*audit-skip/.test(prev)) {
      continue;
    }

    // Look at this line + up to 5 continuation lines
    const slice = lines
      .slice(i, Math.min(lines.length, i + 1 + CONTINUATION_LINES))
      .join('\n');

    // Stop the slice at the next router.<verb>( call to avoid bleeding
    // a downstream `authenticate` argument into this one.
    const sliceLines = slice.split('\n');
    let stop = sliceLines.length;
    for (let j = 1; j < sliceLines.length; j++) {
      if (/\brouter\.(get|post|put|delete|patch|use)\s*\(/.test(sliceLines[j])) {
        stop = j;
        break;
      }
    }
    const window = sliceLines.slice(0, stop).join('\n');

    if (/\bauthenticate\b/.test(window)) continue;
    if (/\bapiKeyAuth\b/.test(window)) continue;

    findings.push({
      file: rel,
      lineNo: i + 1,
      method: (line.match(/router\.(\w+)/) || [])[1] || '?',
      route: extractRoutePath(line) || '<unknown>',
    });
  }

  return { total, findings };
}

function main() {
  const allowlist = loadAllowlist();
  const files = walkJs(ROUTES_DIR);
  let total = 0;
  const allFindings = [];

  for (const f of files) {
    const { total: t, findings } = scanFile(f, allowlist);
    total += t;
    allFindings.push(...findings);
  }

  for (const f of allFindings) {
    console.log(
      `FAIL ${f.file}:${f.lineNo}  router.${f.method}('${f.route}')  no authenticate middleware`
    );
  }

  const fail = allFindings.length;
  const pass = total - fail;
  console.log(
    `Auth middleware audit: ${pass}/${total} routes scanned, ${fail} failures`
  );

  process.exit(fail > 0 ? 1 : 0);
}

main();
