const nodemailer = require('nodemailer');
const { query } = require('../db');

// ─── Transporter ───
let transporter = null;

function getTransporter() {
  if (!transporter && process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// ─── Email Templates ───
const TEMPLATES = {
  new_referral: (data) => ({
    subject: `🤝 Nouvelle recommandation de ${data.partnerName}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; border-radius: 16px 16px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Nouvelle Recommandation</h1>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
          <p style="color: #475569; font-size: 16px; margin-top: 0;">
            <strong>${data.partnerName}</strong> vient de recommander un nouveau prospect.
          </p>
          <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Prospect:</strong> ${data.prospectName}</p>
            <p style="margin: 4px 0;"><strong>Entreprise:</strong> ${data.prospectCompany}</p>
            <p style="margin: 4px 0;"><strong>Niveau:</strong> ${data.level === 'hot' ? '🔥 Chaud' : data.level === 'warm' ? '☀️ Tiède' : '❄️ Froid'}</p>
          </div>
          <a href="${process.env.FRONTEND_URL}/dashboard/referrals/${data.referralId}" 
             style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Voir le détail →
          </a>
        </div>
      </div>
    `,
  }),

  status_update: (data) => ({
    subject: `📋 Mise à jour: ${data.prospectName}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0ea5e9, #6366f1); padding: 32px; border-radius: 16px 16px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Mise à jour de statut</h1>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
          <p style="color: #475569; font-size: 16px; margin-top: 0;">
            Le statut de votre recommandation <strong>${data.prospectName}</strong> a été mis à jour.
          </p>
          <div style="display: flex; align-items: center; gap: 12px; margin: 20px 0;">
            <span style="background: #f1f5f9; padding: 8px 16px; border-radius: 8px; color: #64748b;">${data.oldStatus}</span>
            <span style="color: #94a3b8;">→</span>
            <span style="background: #eef2ff; padding: 8px 16px; border-radius: 8px; color: #6366f1; font-weight: 600;">${data.newStatus}</span>
          </div>
          <a href="${process.env.FRONTEND_URL}/partner/referrals" 
             style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Voir mes recommandations →
          </a>
        </div>
      </div>
    `,
  }),

  deal_won: (data) => ({
    subject: `🏆 Deal gagné ! Commission de ${formatCurrency(data.commission)}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #16a34a, #22c55e); padding: 32px; border-radius: 16px 16px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Deal Gagné !</h1>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
          <p style="color: #475569; font-size: 16px; margin-top: 0;">
            Excellente nouvelle ! Le deal avec <strong>${data.prospectName}</strong> a été conclu.
          </p>
          <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="color: #16a34a; font-size: 14px; margin: 0;">Votre commission</p>
            <p style="color: #16a34a; font-size: 36px; font-weight: 800; margin: 8px 0;">${formatCurrency(data.commission)}</p>
            <p style="color: #64748b; font-size: 14px; margin: 0;">sur un deal de ${formatCurrency(data.dealValue)}</p>
          </div>
          <p style="color: #64748b; font-size: 14px;">
            Merci pour votre recommandation ! L'équipe Skipcall vous contactera pour le règlement.
          </p>
        </div>
      </div>
    `,
  }),
};

function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}

// ─── Queue a notification ───
async function queueNotification(email, name, template, payload) {
  try {
    await query(
      `INSERT INTO notification_queue (recipient_email, recipient_name, template, payload)
       VALUES ($1, $2, $3, $4)`,
      [email, name, template, JSON.stringify(payload)]
    );
  } catch (err) {
    console.error('Queue notification error:', err);
  }
}

// ─── Process queue (worker) ───
async function processQueue() {
  const transport = getTransporter();
  if (!transport) return;

  try {
    const { rows } = await query(
      `SELECT * FROM notification_queue WHERE sent = false ORDER BY created_at ASC LIMIT 10`
    );

    for (const notification of rows) {
      try {
        const templateFn = TEMPLATES[notification.template];
        if (!templateFn) {
          console.warn(`Unknown template: ${notification.template}`);
          continue;
        }

        const { subject, html } = templateFn(notification.payload);

        await transport.sendMail({
          from: process.env.EMAIL_FROM || '"Skipcall" <notifications@skipcall.com>',
          to: notification.recipient_email,
          subject,
          html,
        });

        await query(
          `UPDATE notification_queue SET sent = true, sent_at = NOW() WHERE id = $1`,
          [notification.id]
        );
      } catch (err) {
        console.error(`Failed to send notification ${notification.id}:`, err.message);
        await query(
          `UPDATE notification_queue SET error = $2 WHERE id = $1`,
          [notification.id, err.message]
        );
      }
    }
  } catch (err) {
    console.error('Process queue error:', err);
  }
}

// ─── Start worker ───
function startNotificationWorker(intervalMs = 30000) {
  setInterval(processQueue, intervalMs);
  // Process immediately on start
  setTimeout(processQueue, 5000);
}

module.exports = { queueNotification, startNotificationWorker };
