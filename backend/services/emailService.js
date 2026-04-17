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

// ─── Shared template frame ───────────────────────────────────────────
// Every notification email reuses the same card layout for consistency
// with the existing auth/partner-approval emails. `accent` drives the
// header-badge colour so recipients can tell event types apart at a
// glance. Every mail ends with a "Manage notification preferences"
// link back to /settings for self-service unsubscribe-ish control.
const FRONTEND = process.env.FRONTEND_URL || 'https://refboost.io';
function frame({ accent = '#059669', heading, bodyHtml, ctaLabel, ctaUrl }) {
  return `
    <div style="font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, ${accent}, ${accent}cc); color: #fff; font-weight: 800; font-size: 18px; line-height: 40px;">S</div>
      </div>
      <h2 style="color: #0f172a; font-size: 20px; margin: 0 0 14px;">${heading}</h2>
      <div style="color: #475569; line-height: 1.6; font-size: 15px;">${bodyHtml}</div>
      ${ctaUrl ? `<p style="margin: 24px 0 0;"><a href="${ctaUrl}" style="display: inline-block; padding: 12px 24px; background: ${accent}; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600;">${ctaLabel}</a></p>` : ''}
      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 32px 0 12px;" />
      <p style="color: #94a3b8; font-size: 11px; margin: 0;">
        RefBoost — Programme Partenaires ·
        <a href="${FRONTEND}/settings" style="color: #94a3b8;">Gérer mes préférences de notifications</a>
      </p>
    </div>
  `;
}

function newReferralSubmittedTpl(partnerName, prospectName, prospectCompany) {
  return {
    subject: `Nouveau referral de ${partnerName} : ${prospectName}`,
    html: frame({
      accent: '#6366f1',
      heading: 'Nouveau referral reçu',
      bodyHtml: `
        <p><strong>${partnerName}</strong> vient de soumettre un nouveau prospect&nbsp;:</p>
        <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <div style="font-weight: 700; color: #0f172a; font-size: 16px;">${prospectName}</div>
          ${prospectCompany ? `<div style="color: #64748b; font-size: 14px;">${prospectCompany}</div>` : ''}
        </div>`,
      ctaLabel: 'Voir dans le pipeline',
      ctaUrl: `${FRONTEND}/referrals`,
    }),
  };
}

function referralStatusChangedTpl(partnerName, prospectName, newStatusLabel) {
  return {
    subject: `Votre recommandation « ${prospectName} » est passée en ${newStatusLabel}`,
    html: frame({
      accent: '#6366f1',
      heading: `Bonjour ${partnerName || ''},`.trim(),
      bodyHtml: `
        <p>Votre recommandation <strong>${prospectName}</strong> a changé de statut&nbsp;:</p>
        <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: center;">
          <span style="font-size: 22px; font-weight: 700; color: #6366f1;">${newStatusLabel}</span>
        </div>
        <p>Connectez-vous à votre espace pour suivre l'avancement.</p>`,
      ctaLabel: 'Voir mes recommandations',
      ctaUrl: `${FRONTEND}/partner/referrals`,
    }),
  };
}

function newCommissionAvailableTpl(partnerName, amount, prospectName) {
  return {
    subject: `Commission de ${amount}€ disponible`,
    html: frame({
      accent: '#16a34a',
      heading: `Félicitations ${partnerName || ''} !`.trim(),
      bodyHtml: `
        <p>Votre recommandation <strong>${prospectName}</strong> a abouti.</p>
        <div style="background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center; border: 1px solid #bbf7d0;">
          <div style="color: #16a34a; font-size: 13px; font-weight: 600;">Commission</div>
          <div style="font-size: 32px; font-weight: 800; color: #16a34a;">${amount} €</div>
        </div>`,
      ctaLabel: 'Voir mes paiements',
      ctaUrl: `${FRONTEND}/partner/payments`,
    }),
  };
}

function newPartnerApplicationTpl(applicantName, applicantCompany) {
  return {
    subject: `Nouvelle candidature partenaire : ${applicantName}`,
    html: frame({
      accent: '#f59e0b',
      heading: 'Nouvelle candidature partenaire',
      bodyHtml: `
        <p><strong>${applicantName}</strong>${applicantCompany ? ` (${applicantCompany})` : ''} souhaite rejoindre votre programme.</p>
        <p>Ouvrez le portail pour examiner la candidature et approuver ou refuser.</p>`,
      ctaLabel: 'Voir la candidature',
      ctaUrl: `${FRONTEND}/partners`,
    }),
  };
}

function dealWonTpl(partnerName, prospectName, dealValue) {
  return {
    subject: `Deal gagné ! ${prospectName} — ${dealValue}€`,
    html: frame({
      accent: '#16a34a',
      heading: '🎉 Deal gagné !',
      bodyHtml: `
        <p>La recommandation <strong>${prospectName}</strong> apportée par <strong>${partnerName}</strong> vient d'être signée.</p>
        <div style="background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center; border: 1px solid #bbf7d0;">
          <div style="color: #16a34a; font-size: 13px; font-weight: 600;">Montant</div>
          <div style="font-size: 32px; font-weight: 800; color: #16a34a;">${dealValue} €</div>
        </div>`,
      ctaLabel: 'Voir le pipeline',
      ctaUrl: `${FRONTEND}/referrals`,
    }),
  };
}

function newsPublishedTpl(newsTitle, tenantName, preview) {
  return {
    subject: `${tenantName || 'RefBoost'} — ${newsTitle}`,
    html: frame({
      accent: '#6366f1',
      heading: newsTitle,
      bodyHtml: `
        ${tenantName ? `<p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">${tenantName}</p>` : ''}
        <p>${(preview || '').slice(0, 400)}</p>`,
      ctaLabel: 'Lire la publication',
      ctaUrl: `${FRONTEND}/partner/news`,
    }),
  };
}

function partnerAccessRevoked(partnerName, tenantName) {
  const who = partnerName || '';
  const from = tenantName ? ` au programme <strong>${tenantName}</strong>` : '';
  return {
    subject: `Skipcall — Votre accès a été révoqué`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #dc2626, #ef4444); color: #fff; font-weight: 800; font-size: 18px; line-height: 40px;">S</div>
        </div>
        <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 8px;">Accès révoqué</h2>
        <p style="color: #475569; line-height: 1.6;">Bonjour ${who},</p>
        <p style="color: #475569; line-height: 1.6;">Nous vous informons que votre accès${from} a été révoqué par l'administrateur. Vous ne pourrez plus vous connecter à votre espace partenaire avec cet email.</p>
        <div style="background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 8px; padding: 14px 16px; margin: 20px 0;">
          <div style="color: #b91c1c; font-size: 13px;">Si vous pensez qu'il s'agit d'une erreur, contactez directement votre administrateur de programme.</div>
        </div>
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
  // Legacy template names (kept for existing callers).
  referralStatusChanged,
  newReferralSubmitted,
  commissionPending,
  partnerAccessRevoked,
  // New notification-system templates.
  newReferralSubmittedTpl,
  referralStatusChangedTpl,
  newCommissionAvailableTpl,
  newPartnerApplicationTpl,
  dealWonTpl,
  newsPublishedTpl,
  queueNotification,
  startNotificationWorker,
};
