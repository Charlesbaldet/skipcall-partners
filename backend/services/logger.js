// Structured JSON logger. Emits one line of JSON per log call so
// Railway / log-shipping pipelines can parse fields without regex.
// Every entry carries timestamp + level + message and any context
// the caller passes; tenant_id and request_id are pulled out into
// dedicated columns for filtering even when callers haven't been
// updated to set them yet.

function log(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
    tenant_id: context.tenantId || null,
    request_id: context.requestId || null,
  };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

module.exports = {
  info: (msg, ctx) => log('info', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),
};
