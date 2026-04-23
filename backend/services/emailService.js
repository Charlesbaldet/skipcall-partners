// Email notification service using Resend API
// Set RESEND_API_KEY env variable on Railway to enable

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(` [MOCK] Email to ${to}: ${subject}`);
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
    console.log(` Email sent to ${to}: ${subject}`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Email templates ───

// Legacy wrappers — delegate to the canonical templates so the old
// Skipcall-branded emails pick up the new RefBoost design. Kept for
// any lingering callers; new code should import from
// utils/emailTemplates directly.
const _tpl = require('../utils/emailTemplates');

function referralStatusChanged(partnerName, prospectName, newStatus, statusLabel) {
  return _tpl.referralStatusChange({ partnerName, prospectName, newStatusLabel: statusLabel });
}

function newReferralSubmitted(adminName, partnerName, prospectName, prospectCompany) {
  return _tpl.newReferralToAdmin({ prospectName, prospectCompany, partnerName });
}

function commissionPending(partnerName, amount, prospectName) {
  return _tpl.commissionApproved({ partnerName, prospectName, amount });
}

// ─── Shared template frame ───────────────────────────────────────────
// Delegates to the canonical builder at utils/emailTemplates.js so every
// notification email across the app uses the same navy-header card.
// `accent` is accepted for backwards compat but is no longer used —
// the new design uses a fixed green accent for the CTA button.
const FRONTEND = process.env.FRONTEND_URL || 'https://refboost.io';
const { baseTemplate: _baseTemplate } = require('../utils/emailTemplates');
function frame({ accent, heading, bodyHtml, ctaLabel, ctaUrl }) {
  const content = `${heading ? `<h2>${heading}</h2>` : ''}${bodyHtml || ''}`;
  return _baseTemplate(content, ctaUrl || null, ctaLabel || 'Voir dans RefBoost');
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
      heading: ' Deal gagné !',
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
  const tenant = tenantName || 'votre programme';
  const { renderEmail } = require('../utils/emailTemplates');
  return renderEmail({
    subject: `Votre accès a été révoqué`,
    heading: 'Accès révoqué',
    bodyHtml: `
      <p>Bonjour ${who},</p>
      <p>Votre accès à <strong>${tenant}</strong> a été révoqué par l'administrateur. Vous ne pourrez plus vous connecter à votre espace partenaire avec cet email.</p>
      <div class="highlight">
        Si vous pensez qu'il s'agit d'une erreur, contactez directement votre administrateur de programme.
      </div>`,
  });
}

// ─── Billing ───────────────────────────────────────────────────────
function billingPaymentFailedTpl(recipientName, planLabel) {
  return {
    subject: `Votre paiement a échoué — mettez à jour votre moyen de paiement`,
    html: frame({
      accent: '#dc2626',
      heading: `Bonjour ${recipientName || ''},`.trim(),
      bodyHtml: `
        <p>Votre dernier paiement pour le plan <strong>${planLabel || 'RefBoost'}</strong> a échoué.</p>
        <p>Mettez à jour votre moyen de paiement pour conserver votre plan. Sans action de votre part, votre abonnement sera automatiquement annulé après plusieurs tentatives et votre espace sera rétrogradé au plan Starter.</p>`,
      ctaLabel: 'Mettre à jour le paiement',
      ctaUrl: `${FRONTEND}/billing`,
    }),
  };
}

// Sent right after POST /billing/cancel succeeds (cancellation
// scheduled for end of period). Warm, regretful tone + single CTA to
// reactivate. Distinct from billingSubscriptionCanceledTpl which
// fires once the subscription actually terminates.
function billingSubscriptionCancelingTpl(recipientName, planLabel, endDate, tenantName) {
  return {
    subject: `Désolé de vous voir partir — votre plan ${planLabel || 'RefBoost'} se termine le ${endDate || ''}`.trim(),
    html: frame({
      accent: '#d97706',
      heading: `Bonjour ${recipientName || ''},`.trim(),
      bodyHtml: `
        <p>Nous sommes désolés de vous voir partir${tenantName ? ` de <strong>${tenantName}</strong>` : ''}.</p>
        <p>Votre plan <strong>${planLabel || 'RefBoost'}</strong> restera actif jusqu'au <strong>${endDate || ''}</strong>. Après cette date, votre espace sera basculé automatiquement sur le plan gratuit Starter (3 partenaires max). Vos partenaires existants ne seront pas supprimés.</p>
        <p>Vous pouvez réactiver votre abonnement à tout moment depuis votre page de facturation — tant que la date ci-dessus n'est pas passée, rien ne change pour vous.</p>
        <p style="color:#64748b;">S'il y a quelque chose que nous aurions pu faire mieux, répondez simplement à cet email — nous serions ravis de vous lire.</p>`,
      ctaLabel: 'Réactiver mon abonnement',
      ctaUrl: `${FRONTEND}/billing`,
    }),
  };
}

// Sent when Stripe reports a successful invoice payment (initial
// charge, renewal, upgrade pro-rata). Includes a direct link to the
// invoice PDF on Stripe.
function billingInvoicePaidTpl(recipientName, amountLabel, dateLabel, invoicePdfUrl, tenantName) {
  return {
    subject: `Paiement reçu — ${amountLabel || ''}`.trim(),
    html: frame({
      accent: '#059669',
      heading: `Bonjour ${recipientName || ''},`.trim(),
      bodyHtml: `
        <p>Votre paiement de <strong>${amountLabel || ''}</strong>${tenantName ? ` pour <strong>${tenantName}</strong>` : ''} a bien été traité le <strong>${dateLabel || ''}</strong>.</p>
        <p>Votre facture est disponible en téléchargement ci-dessous.</p>`,
      ctaLabel: invoicePdfUrl ? 'Télécharger la facture' : null,
      ctaUrl: invoicePdfUrl || null,
    }),
  };
}

function billingSubscriptionCanceledTpl(recipientName) {
  return {
    subject: `Votre abonnement a été annulé — retour au plan Starter`,
    html: frame({
      accent: '#64748b',
      heading: `Bonjour ${recipientName || ''},`.trim(),
      bodyHtml: `
        <p>Votre abonnement RefBoost a été annulé et votre espace a été rétrogradé au plan <strong>Starter</strong> gratuit.</p>
        <p>Vos partenaires existants restent actifs, mais vous ne pourrez plus en ajouter de nouveaux au-delà de la limite du plan gratuit. Vous pouvez reprendre un abonnement à tout moment depuis la page de facturation.</p>`,
      ctaLabel: 'Reprendre un abonnement',
      ctaUrl: `${FRONTEND}/billing`,
    }),
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
  billingPaymentFailedTpl,
  billingSubscriptionCanceledTpl,
  billingSubscriptionCancelingTpl,
  billingInvoicePaidTpl,
  queueNotification,
  startNotificationWorker,
};
