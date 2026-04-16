// Resolve the caller's preferred language for localized DB columns.
// Priority: ?lang= query param > Accept-Language header > default ('fr').
// Only whitelisted langs are returned so the value can be safely
// concatenated into a column name (e.g. `short_description_${lang}`).

const SUPPORTED = new Set(['fr', 'en', 'es', 'de', 'it', 'nl', 'pt']);

function resolveLang(req) {
  const q = (req.query && req.query.lang ? String(req.query.lang) : '').toLowerCase().slice(0, 2);
  if (SUPPORTED.has(q)) return q;

  const header = req.headers && req.headers['accept-language'];
  if (header) {
    // "en-US,en;q=0.9,fr;q=0.8" → pick the first tag whose primary subtag we support.
    const tags = String(header).split(',');
    for (const t of tags) {
      const primary = t.trim().split(';')[0].toLowerCase().split('-')[0];
      if (SUPPORTED.has(primary)) return primary;
    }
  }

  return 'fr';
}

module.exports = { resolveLang, SUPPORTED };
