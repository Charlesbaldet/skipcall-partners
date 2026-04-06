// Email notification service using Resend API
// Set RESEND_API_KEY env variable on Railway to enable

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`📧 [MOCK] Email to ${to}: ${subject}`);
    return { success: true, mock: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Skipcall <notifications@skipcall.io>',
        to: [to],
        subject,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) { console.error('Resend error:', data); return { success: false, error: data }; }
    console.log(`📧 Email sent to ${to}: ${subject}`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Email templates ───

function referralStatusChanged(partnerName, prospectName, newStatus, statusLabel) {
  return {
    subject: `Skipcall — Votre recommandation "${prospectName}" est passée en ${statusLabel}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; font-weight: 800; font-size: 18px; line-height: 40px;">S</div>
        </div>
        <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 8px;">Bonjour ${partnerName},</h2>
        <p style="color: #475569; line-height: 1.6;">Votre recommandation <strong>${prospectName}</strong> a changé de statut :</p>
        <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 20px 0; text-align: center;">
          <span style="font-size: 24px; font-weight: 700; color: #6366f1;">${statusLabel}</span>
        </div>
        <p style="color: #475569; line-height: 1.6;">Connectez-vous à votre espace pour suivre l'avancement.</p>
        <a href="${process.env.FRONTEND_URL || 'https://skipcall-partners.vercel.app'}/partner/referrals" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; margin-top: 16px;">Voir mes recommandations</a>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">Skipcall — Programme Partenaires</p>
      </div>
    `,
  };
}

function newReferralSubmitted(adminName, partnerName, prospectName, prospectCompany) {
  return {
    subject: `Skipcall — Nouveau referral de ${partnerName} : ${prospectName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; font-weight: 800; font-size: 18px; line-height: 40px;">S</div>
        </div>
        <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 8px;">Nouveau referral !</h2>
        <p style="color: #475569; line-height: 1.6;"><strong>${partnerName}</strong> vient de soumettre un nouveau prospect :</p>
        <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 20px 0;">
          <div style="font-weight: 700; color: #0f172a; font-size: 16px;">${prospectName}</div>
          ${prospectCompany ? `<div style="color: #64748b; font-size: 14px;">${prospectCompany}</div>` : ''}
        </div>
        <a href="${process.env.FRONTEND_URL || 'https://skipcall-partners.vercel.app'}/referrals" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600;">Voir dans le pipeline</a>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">Skipcall — Programme Partenaires</p>
      </div>
    `,
  };
}

function commissionPending(partnerName, amount, prospectName) {
  return {
    subject: `Skipcall — Commission de ${amount}€ en attente`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; font-weight: 800; font-size: 18px; line-height: 40px;">S</div>
        </div>
        <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 8px;">Commission générée !</h2>
        <p style="color: #475569; line-height: 1.6;">Félicitations ${partnerName} ! Votre recommandation <strong>${prospectName}</strong> a abouti.</p>
        <div style="background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center; border: 1px solid #bbf7d0;">
          <div style="color: #16a34a; font-size: 14px; font-weight: 600;">Commission</div>
          <div style="font-size: 32px; font-weight: 800; color: #16a34a;">${amount} €</div>
        </div>
        <a href="${process.env.FRONTEND_URL || 'https://skipcall-partners.vercel.app'}/partner/payments" style="display: inline-block; padding: 12px 24px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600;">Voir mes paiements</a>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">Skipcall — Programme Partenaires</p>
      </div>
    `,
  };
}

// Placeholder for old emailService compatibility
function queueNotification() {}
function startNotificationWorker() {}

module.exports = {
  sendEmail,
  referralStatusChanged,
  newReferralSubmitted,
  commissionPending,
  queueNotification,
  startNotificationWorker,
};
