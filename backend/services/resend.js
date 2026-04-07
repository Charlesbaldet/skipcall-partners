/**
 * Resend Email Service
 *
 * Thin wrapper around Resend API for transactional emails.
 * Graceful no-op if RESEND_API_KEY is not set (useful in dev/staging).
 *
 * Setup:
 * 1. npm install resend
 * 2. Set RESEND_API_KEY in Railway env
 * 3. Set RESEND_FROM_EMAIL (e.g. 'RefBoost <notifications@refboost.io>')
 */

let resendClient = null;

function getClient() {
  if (resendClient) return resendClient;
  if (!process.env.RESEND_API_KEY) return null;
  try {
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
  } catch (err) {
    console.warn('[resend] Package not installed or init failed:', err.message);
    return null;
  }
}

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || 'RefBoost <notifications@refboost.io>';
}

/**
 * Send a transactional email via Resend.
 * @param {Object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} opts.subject - Email subject
 * @param {string} opts.html - HTML body
 * @param {string} [opts.text] - Plain text fallback (optional, generated from HTML if omitted)
 * @param {string} [opts.replyTo] - Optional Reply-To address
 * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html, text, replyTo }) {
  const client = getClient();
  if (!client) {
    console.warn('[resend] RESEND_API_KEY not configured, email skipped:', subject, '→', to);
    return { ok: false, error: 'not_configured' };
  }
  try {
    const payload = {
      from: getFromAddress(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (text) payload.text = text;
    if (replyTo) payload.reply_to = replyTo;
    const { data, error } = await client.emails.send(payload);
    if (error) {
      console.error('[resend] Send error:', error);
      return { ok: false, error: error.message || 'send_failed' };
    }
    return { ok: true, id: data && data.id };
  } catch (err) {
    console.error('[resend] Exception:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Send an email and also enqueue it in notification_queue for audit/retry.
 * @param {Object} opts - Same as sendEmail + { template, payload, query }
 * @param {Function} opts.query - The db query function (to log in notification_queue)
 * @param {string} opts.template - Template name for audit log
 * @param {Object} opts.payload - Original payload (for audit log)
 */
async function sendAndLog({ to, subject, html, text, replyTo, template, payload, query }) {
  const result = await sendEmail({ to, subject, html, text, replyTo });
  if (query) {
    try {
      await query(
        'INSERT INTO notification_queue (recipient_email, recipient_name, template, payload, sent, sent_at, error) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [to, (payload && payload.recipient_name) || null, template, JSON.stringify(payload || {}), result.ok, result.ok ? new Date() : null, result.ok ? null : result.error]
      );
    } catch (logErr) {
      console.error('[resend] Failed to log to notification_queue:', logErr.message);
    }
  }
  return result;
}

module.exports = {
  isConfigured,
  sendEmail,
  sendAndLog,
};
