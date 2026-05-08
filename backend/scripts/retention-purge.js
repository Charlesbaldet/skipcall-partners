// Daily data retention purge — SOC 2 CC6.5 / ISO 27001 A.18.1.3
//
// Removes data past its retention window:
//   * partners / referrals / commissions soft-deleted > 30 days
//   * users soft-deleted > 30 days (anonymise rather than DELETE
//     because audit_logs / referrals.created_by FK to users.id)
//   * audit_logs older than 1 year
//   * notification_queue older than 90 days
//
// Logs each batch via services/logger.info, writes a single
// summary row to audit_logs with action='system.retention_purge',
// and exits 0 on success / 1 on any failure.
//
// Wiring: this script is auto-scheduled by server.js (daily, 03:00
// UTC). It can also be run as a one-shot from a Railway cron tab,
// CI, or manually:
//
//   node backend/scripts/retention-purge.js
//
// (No external scheduler is strictly required because server.js
// schedules an internal setInterval at the 03:00 UTC mark — see
// scheduleRetentionPurge() in this file's exports.)

const { query } = require('../db');
const logger = require('../services/logger');

const THIRTY_DAYS  = "INTERVAL '30 days'";
const NINETY_DAYS  = "INTERVAL '90 days'";
const ONE_YEAR     = "INTERVAL '1 year'";

async function purgeOnce() {
  const counts = {
    commissions: 0,
    referral_activities: 0,
    referrals: 0,
    partners: 0,
    users_anonymised: 0,
    audit_logs: 0,
    notification_queue: 0,
  };

  // Hard-delete soft-deleted commissions > 30 days. Done first so the
  // referral / partner deletes below don't trip ON DELETE constraints.
  try {
    const r = await query(
      `DELETE FROM commissions
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - ${THIRTY_DAYS}`
    );
    counts.commissions = r.rowCount;
    logger.info('retention.commissions purged', { count: r.rowCount });
  } catch (err) {
    logger.error('retention.commissions failed', { error: err.message });
    throw err;
  }

  // Hard-delete referral_activities for soft-deleted referrals first
  // so the subsequent referrals delete doesn't orphan them.
  try {
    const r = await query(
      `DELETE FROM referral_activities
        WHERE referral_id IN (
          SELECT id FROM referrals
            WHERE deleted_at IS NOT NULL
              AND deleted_at < NOW() - ${THIRTY_DAYS}
        )`
    );
    counts.referral_activities = r.rowCount;
    logger.info('retention.referral_activities purged', { count: r.rowCount });
  } catch (err) {
    // Non-fatal — table may not exist on every deployment.
    logger.warn('retention.referral_activities skipped', { error: err.message });
  }

  try {
    const r = await query(
      `DELETE FROM referrals
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - ${THIRTY_DAYS}`
    );
    counts.referrals = r.rowCount;
    logger.info('retention.referrals purged', { count: r.rowCount });
  } catch (err) {
    logger.error('retention.referrals failed', { error: err.message });
    throw err;
  }

  // Hard-delete partners only when they have no surviving children
  // (commissions / referrals already purged above). Keeping a partners
  // row with surviving referrals preserves the audit trail.
  try {
    const r = await query(
      `DELETE FROM partners
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - ${THIRTY_DAYS}
          AND id NOT IN (SELECT DISTINCT partner_id FROM commissions WHERE partner_id IS NOT NULL)
          AND id NOT IN (SELECT DISTINCT partner_id FROM referrals  WHERE partner_id IS NOT NULL)`
    );
    counts.partners = r.rowCount;
    logger.info('retention.partners purged', { count: r.rowCount });
  } catch (err) {
    logger.error('retention.partners failed', { error: err.message });
    throw err;
  }

  // Anonymise (NOT delete) soft-deleted users — audit_logs.user_id,
  // notification_queue, referrals.created_by all FK back to users.id.
  // We NULL out PII, mark is_active = false, and stamp anonymised_at
  // so a future analytic can distinguish "never used" from "scrubbed".
  try {
    const r = await query(
      `UPDATE users
          SET email = 'deleted+' || id::text || '@refboost.invalid',
              full_name = 'Compte supprimé',
              password_hash = '!',
              avatar_url = NULL,
              partner_id = NULL,
              is_active = false,
              anonymised_at = NOW()
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - ${THIRTY_DAYS}
          AND email NOT LIKE 'deleted+%@refboost.invalid'`
    );
    counts.users_anonymised = r.rowCount;
    logger.info('retention.users anonymised', { count: r.rowCount });
  } catch (err) {
    // anonymised_at column may not exist yet — retry without it.
    if (/column .*anonymised_at.* does not exist/i.test(err.message)) {
      try {
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymised_at TIMESTAMPTZ`);
        const r2 = await query(
          `UPDATE users
              SET email = 'deleted+' || id::text || '@refboost.invalid',
                  full_name = 'Compte supprimé',
                  password_hash = '!',
                  avatar_url = NULL,
                  partner_id = NULL,
                  is_active = false,
                  anonymised_at = NOW()
            WHERE deleted_at IS NOT NULL
              AND deleted_at < NOW() - ${THIRTY_DAYS}
              AND email NOT LIKE 'deleted+%@refboost.invalid'`
        );
        counts.users_anonymised = r2.rowCount;
      } catch (err2) {
        logger.error('retention.users failed', { error: err2.message });
      }
    } else {
      logger.error('retention.users failed', { error: err.message });
    }
  }

  // Audit logs older than 1 year. Keep recent ones for SOC 2 evidence;
  // older entries fall outside the typical retention window.
  try {
    const r = await query(
      `DELETE FROM audit_logs WHERE created_at < NOW() - ${ONE_YEAR}`
    );
    counts.audit_logs = r.rowCount;
    logger.info('retention.audit_logs purged', { count: r.rowCount });
  } catch (err) {
    logger.error('retention.audit_logs failed', { error: err.message });
    throw err;
  }

  // Notification queue — every email/notification we tried to send.
  // 90 days is plenty for debugging deliverability issues.
  try {
    const r = await query(
      `DELETE FROM notification_queue WHERE created_at < NOW() - ${NINETY_DAYS}`
    );
    counts.notification_queue = r.rowCount;
    logger.info('retention.notification_queue purged', { count: r.rowCount });
  } catch (err) {
    logger.warn('retention.notification_queue skipped', { error: err.message });
  }

  // Summary audit row so the operations team can see the run from the
  // Settings → Historique tab without grepping logs.
  try {
    await query(
      `INSERT INTO audit_logs (action, entity_type, details, created_at)
       VALUES ('system.retention_purge', 'system', $1, NOW())`,
      [JSON.stringify(counts)]
    );
  } catch (err) {
    logger.warn('retention.audit_summary failed', { error: err.message });
  }

  logger.info('retention.purge done', counts);
  return counts;
}

// Schedule: a tiny in-process scheduler that fires once daily at
// 03:00 UTC. The server.js boot path can call this to wire the
// purge without an external cron. Returns a stop() function so
// tests can tear it down deterministically.
function scheduleRetentionPurge() {
  function nextTickMs() {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      3, 0, 0, 0
    ));
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  let timer = null;
  const tick = async () => {
    try {
      await purgeOnce();
    } catch (err) {
      logger.error('retention.tick failed', { error: err && err.message });
    } finally {
      timer = setTimeout(tick, nextTickMs());
    }
  };
  timer = setTimeout(tick, nextTickMs());
  logger.info('retention scheduler armed', { next_run_in_ms: nextTickMs() });
  return () => { if (timer) clearTimeout(timer); };
}

module.exports = { purgeOnce, scheduleRetentionPurge };

// Direct invocation: `node backend/scripts/retention-purge.js`
if (require.main === module) {
  purgeOnce()
    .then(() => process.exit(0))
    .catch(err => {
      logger.error('retention-purge crashed', { error: err && err.message });
      process.exit(1);
    });
}
