const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
const notify = require('../services/notifyService');
const { sendEmail } = require('../services/emailService');
const { renderEmail } = require('../utils/emailTemplates');

const FRONTEND = () => (process.env.FRONTEND_URL || 'https://refboost.io').replace(/\/$/, '');

// Fire-and-forget: for every OTHER participant of the conversation,
// write an in-app notification and (if their prefs allow) send the
// "new message" email. Never blocks the POST response.
async function notifyNewMessage(conversationId, senderId, tenantId, content) {
  try {
    const { rows: [sender] } = await query(
      'SELECT id, full_name, role FROM users WHERE id = $1',
      [senderId]
    );
    const senderName = sender?.full_name || 'Un utilisateur';
    const { rows: recipients } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.partner_id
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
        WHERE cp.conversation_id = $1
          AND cp.user_id <> $2
          AND u.is_active = TRUE`,
      [conversationId, senderId]
    );
    const preview = String(content || '').slice(0, 180);
    const link = '/messaging?c=' + conversationId;

    for (const r of recipients) {
      // In-app — always (partners + admins). Uses the generic event key.
      notify.createNotification(r.id, 'new_message', {
        title: `Nouveau message de ${senderName}`,
        message: preview,
        link,
        tenantId,
      }, { skipPreferenceCheck: true }).catch(() => {});

      // Email — gated by partner.notification_preferences.email_new_message
      // for partners, tenant prefs for admins. If neither check says
      // yes, skip.
      (async () => {
        try {
          let emailOn = true;
          if (r.role === 'partner' && r.partner_id) {
            const p = await notify.shouldNotifyPartner(r.partner_id, 'email_new_message');
            emailOn = p.email;
          }
          if (!emailOn || !r.email) return;
          const tpl = renderEmail({
            subject: `Nouveau message de ${senderName}`,
            heading: `Nouveau message de ${senderName}`,
            bodyHtml: `
              <p>Bonjour ${r.full_name || ''},</p>
              <p>${senderName} vous a envoyé un nouveau message&nbsp;:</p>
              <div class="highlight"><em>${preview.replace(/[<>]/g, '')}</em></div>
              <p>Répondez directement depuis RefBoost.</p>`,
            ctaUrl: FRONTEND() + link,
            ctaLabel: 'Voir la conversation',
          });
          sendEmail(r.email, tpl.subject, tpl.html).catch(() => {});
        } catch (err) {
          console.error('[messages.notifyEmail]', err.message);
        }
      })();
    }
  } catch (err) {
    console.error('[messages.notifyNewMessage]', err.message);
  }
}

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);
router.use(partnerScope);

// ─── List conversations for current user ───
// CRITICAL tenant gate: a single users.id can be a participant in
// conversations across multiple tenants when the same email was
// re-invited as a partner in two programs (a real production case
// that surfaced this bug). Filtering only by user_id leaks every
// such conversation into whichever tenant the user happens to be
// in right now. The c.tenant_id filter pins the listing to the
// active tenant from the JWT.
router.get('/conversations', async (req, res) => {
  try {
    if (!req.tenantId && !req.skipTenantFilter) {
      return res.status(400).json({ error: 'tenant_missing' });
    }
    const { rows } = await query(
      `SELECT c.*,
        cp_me.last_read_at,
        u.full_name as created_by_name,
        (SELECT p2.name FROM conversation_participants cp2 JOIN users u3 ON cp2.user_id = u3.id JOIN partners p2 ON u3.partner_id = p2.id WHERE cp2.conversation_id = c.id LIMIT 1) as partner_name,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT u2.full_name FROM messages m JOIN users u2 ON m.sender_id = u2.id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_by,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > cp_me.last_read_at AND m.sender_id != $1) as unread_count
       FROM conversations c
       JOIN conversation_participants cp_me ON cp_me.conversation_id = c.id AND cp_me.user_id = $1
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN partners p ON c.partner_id = p.id
       WHERE c.is_archived = false
         AND c.tenant_id = $2
       ORDER BY c.last_message_at DESC`,
      [req.user.id, req.tenantId]
    );
    res.json({ conversations: rows });
  } catch (err) {
    console.error('List conversations error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Create conversation ───
router.post('/conversations', [
  body('subject').trim().notEmpty(),
  body('participant_ids').isArray({ min: 1 }),
  body('message').trim().notEmpty(),
], async (req, res) => {
  const client = await getClient();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { subject, participant_ids, message, partner_id } = req.body;

    if (!req.tenantId) {
      return res.status(400).json({ error: 'tenant_missing' });
    }

    await client.query('BEGIN');

    // Create conversation pinned to the requester's active tenant.
    // The legacy schema had no tenant_id (added in v37); without
    // setting it on INSERT every new conversation would be
    // un-filterable and re-introduce the cross-tenant leak.
    const { rows: [conv] } = await client.query(
      `INSERT INTO conversations (subject, partner_id, created_by, tenant_id, last_message_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [subject, partner_id || null, req.user.id, req.tenantId]
    );

    // Add creator as participant
    await client.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)`,
      [conv.id, req.user.id]
    );

    // Security: verify all participants belong to current tenant
    if (participant_ids.length > 0) {
      const { rows: validUsers } = await client.query(
        'SELECT id FROM users WHERE id = ANY($1) AND tenant_id = $2',
        [participant_ids, req.tenantId]
      );
      const validIds = new Set(validUsers.map(u => u.id));
      for (const pid of participant_ids) {
        if (!validIds.has(pid) && pid !== req.user.id) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(403).json({ error: 'Participant invalide ou hors tenant' });
        }
      }
    }
    // Add other participants
    for (const pid of participant_ids) {
      if (pid !== req.user.id) {
        await client.query(
          `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [conv.id, pid]
        );
      }
    }

    // Add first message
    await client.query(
      `INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)`,
      [conv.id, req.user.id, message]
    );

    await client.query('COMMIT');
    res.status(201).json({ conversation: conv });
    // Fire-and-forget first-message notification.
    notifyNewMessage(conv.id, req.user.id, req.tenantId, message);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create conversation error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── Get messages for a conversation ───
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    // Verify user is participant AND the conversation belongs to
    // the active tenant. The participant check alone allowed
    // cross-tenant reads when the same users.id was attached to
    // two tenants' conversations.
    const { rows: participation } = await query(
      `SELECT 1
         FROM conversation_participants cp
         JOIN conversations c ON c.id = cp.conversation_id
        WHERE cp.conversation_id = $1
          AND cp.user_id = $2
          AND ($3::uuid IS NULL OR c.tenant_id = $3)`,
      [req.params.id, req.user.id, req.skipTenantFilter ? null : (req.tenantId || null)]
    );
    if (participation.length === 0) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const { rows: messages } = await query(
      `SELECT m.*, u.full_name as sender_name, u.role as sender_role
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    // Get conversation details
    const { rows: [conv] } = await query(
      `SELECT c.*, p.name as partner_name FROM conversations c 
       LEFT JOIN partners p ON c.partner_id = p.id WHERE c.id = $1`,
      [req.params.id]
    );

    // Get participants
    const { rows: participants } = await query(
      `SELECT u.id, u.full_name, u.role FROM conversation_participants cp
       JOIN users u ON cp.user_id = u.id WHERE cp.conversation_id = $1`,
      [req.params.id]
    );

    // Mark as read
    await query(
      `UPDATE conversation_participants SET last_read_at = NOW() 
       WHERE conversation_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    res.json({ messages, conversation: conv, participants });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Send message ───
router.post('/conversations/:id/messages', [
  body('content').trim().notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Message vide' });
    }

    // Verify user is participant AND the conversation belongs to
    // the active tenant — same gate as the read path so a
    // cross-tenant participant can't post into a foreign tenant's
    // thread.
    const { rows: participation } = await query(
      `SELECT 1
         FROM conversation_participants cp
         JOIN conversations c ON c.id = cp.conversation_id
        WHERE cp.conversation_id = $1
          AND cp.user_id = $2
          AND ($3::uuid IS NULL OR c.tenant_id = $3)`,
      [req.params.id, req.user.id, req.skipTenantFilter ? null : (req.tenantId || null)]
    );
    if (participation.length === 0) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const { rows: [msg] } = await query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, req.user.id, req.body.content]
    );

    // Update conversation last_message_at
    await query(
      `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    // Update sender's last_read_at
    await query(
      `UPDATE conversation_participants SET last_read_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    // Get sender info for response
    const { rows: [sender] } = await query(
      `SELECT full_name, role FROM users WHERE id = $1`, [req.user.id]
    );

    res.status(201).json({
      message: { ...msg, sender_name: sender.full_name, sender_role: sender.role }
    });
    // Fire-and-forget — notify every other participant.
    notifyNewMessage(req.params.id, req.user.id, req.tenantId, req.body.content);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Get unread count (for nav badge) ───
// Tenant gate: same reasoning as the conversations list. Without
// it, the badge in the active tenant counted unread messages
// across every tenant the user participates in.
router.get('/unread', async (req, res) => {
  try {
    const { rows: [{ count }] } = await query(
      `SELECT COUNT(DISTINCT m.id) as count
       FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $1
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.created_at > cp.last_read_at
         AND m.sender_id != $1
         AND ($2::uuid IS NULL OR c.tenant_id = $2)`,
      [req.user.id, req.skipTenantFilter ? null : (req.tenantId || null)]
    );
    res.json({ unread: parseInt(count) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── List users available for messaging ───
router.get('/users', async (req, res) => {
  try {
    let whereClause = 'WHERE u.is_active = true AND u.id != $1';
    const params = [req.user.id];
    // Tenant isolation : restrict to users of current tenant
    if (req.tenantId && !req.skipTenantFilter) {
      params.push(req.tenantId);
      whereClause += ` AND u.tenant_id = $${params.length}`;
    }

    // Partners can only message admins and commercials
    if (req.user.role === 'partner') {
      whereClause += ` AND u.role IN ('admin', 'commercial')`;
    }

    const { rows } = await query(
      `SELECT u.id, u.full_name, u.role, p.name as partner_name
       FROM users u LEFT JOIN partners p ON u.partner_id = p.id
       ${whereClause}
       ORDER BY u.role, u.full_name`,
      params
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// ─── Delete conversation ───
router.delete('/conversations/:id', async (req, res) => {
  try {
    const { rows: part } = await query(
      `SELECT 1
         FROM conversation_participants cp
         JOIN conversations c ON c.id = cp.conversation_id
        WHERE cp.conversation_id = $1
          AND cp.user_id = $2
          AND ($3::uuid IS NULL OR c.tenant_id = $3)`,
      [req.params.id, req.user.id, req.skipTenantFilter ? null : (req.tenantId || null)]
    );
    if (part.length === 0) return res.status(403).json({ error: 'Accès interdit' });
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      await query('DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      return res.json({ message: 'Vous avez quitté la conversation' });
    }
    await query('DELETE FROM messages WHERE conversation_id = $1', [req.params.id]);
    await query('DELETE FROM conversation_participants WHERE conversation_id = $1', [req.params.id]);
    await query('DELETE FROM conversations WHERE id = $1', [req.params.id]);
    res.json({ message: 'Conversation supprimée' });
  } catch (err) {
    console.error('Delete conv error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Cleanup old messages (>10 messages, older than 30 days) ───
router.post('/cleanup', authorize('admin'), async (req, res) => {
  try {
    const { rowCount } = await query(`
      DELETE FROM messages
      WHERE id IN (
        SELECT m.id FROM messages m
        JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
        JOIN users u ON cp.user_id = u.id
        WHERE m.created_at < NOW() - INTERVAL '30 days'
          AND u.tenant_id = $1
          AND m.id NOT IN (
            SELECT id FROM messages m2
            WHERE m2.conversation_id = m.conversation_id
            ORDER BY m2.created_at DESC LIMIT 10
          )
      )
    `, [req.tenantId]);
    res.json({ deleted: rowCount });
  } catch (err) {
    console.error('Cleanup error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
