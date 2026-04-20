/**
 * RefBoost — Shared email template builder.
 *
 * Every transactional email should flow through `baseTemplate(content,
 * ctaUrl, ctaText)`. The markup mirrors the design spec: navy header
 * strip with "Ref" (white) + "Boost" (green), white card body on a pale
 * grey background, green CTA button, and a compact footer.
 *
 * Two higher-level helpers are exported:
 *   - `baseTemplate(content, ctaUrl, ctaText)`  — raw builder
 *   - `renderEmail({ subject, heading, bodyHtml, ctaUrl, ctaLabel })`
 *     — returns `{ subject, html, text }`; the shape every send-site
 *     expects.
 *
 * Thirteen named builders cover the catalog in the spec. Each uses
 * `renderEmail` so we get consistent layout for free.
 *
 * Runtime: this module is `require`-safe from any Node context (no
 * top-level network / DB calls). Tests can call `previewEmail(key,
 * sample)` to render any template with sample data — that's what the
 * Settings preview modal hits.
 */

const FRONTEND = (process.env.FRONTEND_URL || 'https://refboost.io').replace(/\/$/, '');

const fmtMoney = (n, cur = '€') => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur === '€' ? 'EUR' : cur }).format(num);
  } catch {
    return num.toFixed(2) + ' ' + cur;
  }
};

// ═══ Base layout ══════════════════════════════════════════════════
// Mobile-first: 580px max-width card, fluid padding, `!important`
// colour on CTA to survive Gmail's dark-mode inversion.
function baseTemplate(content, ctaUrl, ctaText) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RefBoost</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 40px; margin-bottom: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: #1a2236; padding: 24px 32px; text-align: center; }
    .header img { height: 32px; }
    .header-text { color: #ffffff; font-size: 18px; font-weight: 700; }
    .header-text span { color: #059669; }
    .body { padding: 32px; color: #374151; font-size: 15px; line-height: 1.6; }
    .body h2 { color: #1a2236; font-size: 20px; margin-top: 0; }
    .cta { display: inline-block; background: #059669; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { padding: 24px 32px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
    .highlight { background: #f0fdf4; border-left: 3px solid #059669; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0; }
    .stat { font-size: 24px; font-weight: 700; color: #059669; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-text">Ref<span>Boost</span></div>
    </div>
    <div class="body">
      ${content}
      ${ctaUrl ? `<p style="text-align:center"><a href="${ctaUrl}" class="cta">${ctaText || 'Voir dans RefBoost'}</a></p>` : ''}
    </div>
    <div class="footer">
      <p>RefBoost — Gestion de programme partenaires</p>
      <p><a href="https://refboost.io" style="color:#059669">refboost.io</a></p>
    </div>
  </div>
</body>
</html>`;
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Standard { subject, html, text } wrapper so send-sites don't have to
// hand-build text fallbacks.
function renderEmail({ subject, heading, bodyHtml, ctaUrl, ctaLabel }) {
  const content = `${heading ? `<h2>${heading}</h2>` : ''}${bodyHtml || ''}`;
  const html = baseTemplate(content, ctaUrl || null, ctaLabel);
  const text = [heading, stripHtml(bodyHtml), ctaUrl && `${ctaLabel || 'Voir dans RefBoost'}: ${ctaUrl}`]
    .filter(Boolean).join('\n\n');
  return { subject, html, text };
}

// ═══ 13 named templates ═══════════════════════════════════════════

function welcome({ name, tenantName, dashboardUrl } = {}) {
  const who = name || 'bonjour';
  const tenant = tenantName || 'RefBoost';
  return renderEmail({
    subject: `Bienvenue sur RefBoost, ${who} !`,
    heading: `Bienvenue sur RefBoost, ${who} !`,
    bodyHtml: `
      <p>Votre espace <strong>${tenant}</strong> est prêt. Vous pouvez dès maintenant inviter vos premiers partenaires, configurer votre pipeline et suivre vos commissions.</p>
      <div class="highlight">
        <p style="margin:0;"><strong>Conseil :</strong> commencez par configurer votre taux de commission par défaut dans les paramètres.</p>
      </div>
      <p>Besoin d'aide ? Répondez simplement à cet email, on vous lit.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/dashboard`,
    ctaLabel: 'Accéder à mon espace',
  });
}

function partnerInvite({ recipientName, tenantName, inviteUrl } = {}) {
  const who = recipientName || 'bonjour';
  const tenant = tenantName || 'RefBoost';
  return renderEmail({
    subject: `${tenant} vous invite à rejoindre son programme partenaires`,
    heading: `${tenant} vous invite comme partenaire`,
    bodyHtml: `
      <p>Bonjour ${who},</p>
      <p><strong>${tenant}</strong> vous invite à rejoindre son programme partenaires. Recommandez des prospects qualifiés et percevez une commission pour chaque deal conclu.</p>
      <p>Activez votre compte pour accéder à votre pipeline, vos commissions et les ressources de communication.</p>
      <p style="color:#9ca3af;font-size:13px;">Ce lien expire dans 7 jours.</p>`,
    ctaUrl: inviteUrl,
    ctaLabel: 'Activer mon compte partenaire',
  });
}

function newReferralToAdmin({ prospectName, prospectCompany, partnerName, dashboardUrl } = {}) {
  return renderEmail({
    subject: `Nouveau referral : ${prospectName} soumis par ${partnerName}`,
    heading: 'Nouveau referral',
    bodyHtml: `
      <p><strong>${partnerName}</strong> vient de soumettre un nouveau prospect :</p>
      <div class="highlight">
        <div style="font-weight:700;font-size:16px;">${prospectName}</div>
        ${prospectCompany ? `<div style="color:#6b7280;font-size:14px;">${prospectCompany}</div>` : ''}
      </div>
      <p>Prenez contact rapidement pour maximiser vos chances de conversion.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/referrals`,
    ctaLabel: 'Voir dans le pipeline',
  });
}

function referralStatusChange({ partnerName, prospectName, newStatusLabel, dashboardUrl } = {}) {
  return renderEmail({
    subject: `Votre referral ${prospectName} a changé de statut`,
    heading: `Bonjour ${partnerName || ''}`.trim(),
    bodyHtml: `
      <p>Votre referral <strong>${prospectName}</strong> est passé au statut suivant :</p>
      <div class="highlight" style="text-align:center;">
        <span class="stat">${newStatusLabel}</span>
      </div>
      <p>Connectez-vous pour suivre l'avancement et discuter avec l'équipe commerciale.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/partner/referrals`,
    ctaLabel: 'Voir mes referrals',
  });
}

function commissionToApprove({ adminName, partnerName, prospectName, amount, currency, dashboardUrl } = {}) {
  const amt = fmtMoney(amount, currency);
  return renderEmail({
    subject: `${partnerName} a marqué un deal comme gagné — commission à approuver`,
    heading: 'Commission à approuver',
    bodyHtml: `
      <p>Bonjour ${adminName || ''},</p>
      <p><strong>${partnerName}</strong> a marqué <strong>${prospectName}</strong> comme gagné.</p>
      <div class="highlight" style="text-align:center;">
        <div style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Commission à valider</div>
        <div class="stat">${amt}</div>
      </div>
      <p>Approuvez ou rejetez la commission pour débloquer le paiement.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/commissions`,
    ctaLabel: 'Examiner la commission',
  });
}

function commissionApproved({ partnerName, prospectName, amount, currency, dashboardUrl } = {}) {
  const amt = fmtMoney(amount, currency);
  return renderEmail({
    subject: `Votre commission de ${amt} a été approuvée !`,
    heading: 'Commission approuvée',
    bodyHtml: `
      <p>Bonne nouvelle ${partnerName || ''} !</p>
      <p>Votre commission pour <strong>${prospectName || ''}</strong> a été validée par l'administrateur.</p>
      <div class="highlight" style="text-align:center;">
        <div style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Montant validé</div>
        <div class="stat">${amt}</div>
      </div>
      <p>Elle sera versée selon le calendrier habituel du programme.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/partner/payments`,
    ctaLabel: 'Voir mes paiements',
  });
}

function commissionRejected({ partnerName, prospectName, reason, dashboardUrl } = {}) {
  return renderEmail({
    subject: `Votre commission pour ${prospectName} nécessite une révision`,
    heading: 'Commission à revoir',
    bodyHtml: `
      <p>Bonjour ${partnerName || ''},</p>
      <p>Votre commission pour <strong>${prospectName || ''}</strong> nécessite une révision avant validation.</p>
      ${reason ? `<div class="highlight"><strong>Motif :</strong><br/>${reason}</div>` : ''}
      <p>Contactez votre gestionnaire de programme pour clarifier la situation.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/partner/payments`,
    ctaLabel: 'Voir les détails',
  });
}

function paymentFailure({ recipientName, planLabel, dashboardUrl } = {}) {
  return renderEmail({
    subject: `Échec de paiement pour votre abonnement RefBoost`,
    heading: 'Échec de paiement',
    bodyHtml: `
      <p>Bonjour ${recipientName || ''},</p>
      <p>Votre dernier paiement pour le plan <strong>${planLabel || 'RefBoost'}</strong> a échoué.</p>
      <div class="highlight">
        <strong>Action requise :</strong> mettez à jour votre moyen de paiement pour éviter la suspension de votre abonnement.
      </div>
      <p>Sans action de votre part, votre espace sera automatiquement rétrogradé au plan Starter gratuit après plusieurs tentatives infructueuses.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/billing`,
    ctaLabel: 'Mettre à jour le paiement',
  });
}

function subscriptionCancelled({ recipientName, endDate, dashboardUrl } = {}) {
  return renderEmail({
    subject: `Votre abonnement a été annulé`,
    heading: 'Abonnement annulé',
    bodyHtml: `
      <p>Bonjour ${recipientName || ''},</p>
      <p>Votre abonnement RefBoost a été annulé${endDate ? ` et restera actif jusqu'au <strong>${endDate}</strong>` : ''}.</p>
      <p>Vos partenaires existants resteront actifs, mais vous ne pourrez plus en ajouter au-delà de la limite du plan gratuit Starter.</p>
      <p>Vous pouvez reprendre un abonnement à tout moment.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/billing`,
    ctaLabel: 'Reprendre un abonnement',
  });
}

function passwordReset({ recipientName, resetUrl } = {}) {
  return renderEmail({
    subject: `Réinitialisez votre mot de passe RefBoost`,
    heading: 'Réinitialisation de mot de passe',
    bodyHtml: `
      <p>Bonjour ${recipientName || ''},</p>
      <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.</p>
      <p style="color:#9ca3af;font-size:13px;">Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email — votre mot de passe restera inchangé.</p>`,
    ctaUrl: resetUrl,
    ctaLabel: 'Réinitialiser mon mot de passe',
  });
}

function newApplicationToAdmin({ applicantName, applicantCompany, dashboardUrl } = {}) {
  return renderEmail({
    subject: `Nouvelle candidature partenaire : ${applicantName}`,
    heading: 'Nouvelle candidature partenaire',
    bodyHtml: `
      <p><strong>${applicantName}</strong>${applicantCompany ? ` (${applicantCompany})` : ''} souhaite rejoindre votre programme.</p>
      <p>Ouvrez le portail pour examiner la candidature et approuver ou refuser.</p>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/partners`,
    ctaLabel: 'Voir la candidature',
  });
}

function applicationApproved({ applicantName, tenantName, dashboardUrl } = {}) {
  const tenant = tenantName || 'RefBoost';
  return renderEmail({
    subject: `Votre candidature a été acceptée !`,
    heading: 'Bienvenue dans le programme !',
    bodyHtml: `
      <p>Bonjour ${applicantName || ''},</p>
      <p>Félicitations ! Votre candidature au programme partenaires de <strong>${tenant}</strong> a été acceptée.</p>
      <div class="highlight">
        Connectez-vous à votre espace pour commencer à recommander des prospects et suivre vos commissions en temps réel.
      </div>`,
    ctaUrl: dashboardUrl || `${FRONTEND}/partner/referrals`,
    ctaLabel: 'Accéder à mon espace',
  });
}

function invoice({ recipientName, amount, currency, dateLabel, invoicePdfUrl, tenantName } = {}) {
  const amt = fmtMoney(amount, currency);
  return renderEmail({
    subject: `Facture RefBoost — ${amt}`,
    heading: 'Paiement reçu',
    bodyHtml: `
      <p>Bonjour ${recipientName || ''},</p>
      <p>Votre paiement de <strong>${amt}</strong>${tenantName ? ` pour <strong>${tenantName}</strong>` : ''}${dateLabel ? ` du <strong>${dateLabel}</strong>` : ''} a bien été traité. Merci !</p>
      <div class="highlight">
        <strong>Facture :</strong> ${invoicePdfUrl ? 'téléchargeable via le bouton ci-dessous.' : 'consultable depuis votre espace de facturation.'}
      </div>`,
    ctaUrl: invoicePdfUrl || `${FRONTEND}/billing`,
    ctaLabel: invoicePdfUrl ? 'Télécharger la facture' : 'Voir mes factures',
  });
}

// Sample payloads for the preview modal. Keys match TEMPLATES below.
const PREVIEW_SAMPLES = {
  welcome: { name: 'Alex', tenantName: 'Acme Partenaires' },
  partnerInvite: { recipientName: 'Camille Leroy', tenantName: 'Acme', inviteUrl: 'https://refboost.io/activate/sample-token' },
  newReferralToAdmin: { prospectName: 'Jean Dupont', prospectCompany: 'Dupont SARL', partnerName: 'Partner Pro' },
  referralStatusChange: { partnerName: 'Partner Pro', prospectName: 'Jean Dupont', newStatusLabel: 'Proposition envoyée' },
  commissionToApprove: { adminName: 'Charles', partnerName: 'Partner Pro', prospectName: 'Jean Dupont', amount: 1250, currency: '€' },
  commissionApproved: { partnerName: 'Partner Pro', prospectName: 'Jean Dupont', amount: 1250, currency: '€' },
  commissionRejected: { partnerName: 'Partner Pro', prospectName: 'Jean Dupont', reason: "Le deal n'a pas encore été officiellement signé." },
  paymentFailure: { recipientName: 'Charles', planLabel: 'Pro' },
  subscriptionCancelled: { recipientName: 'Charles', endDate: '30 avril 2026' },
  passwordReset: { recipientName: 'Charles', resetUrl: 'https://refboost.io/reset/sample-token' },
  newApplicationToAdmin: { applicantName: 'Camille Leroy', applicantCompany: 'Leroy Conseil' },
  applicationApproved: { applicantName: 'Camille Leroy', tenantName: 'Acme Partenaires' },
  invoice: { recipientName: 'Charles', amount: 29, currency: '€', dateLabel: '20 avril 2026', tenantName: 'Acme Partenaires' },
};

const TEMPLATES = {
  welcome,
  partnerInvite,
  newReferralToAdmin,
  referralStatusChange,
  commissionToApprove,
  commissionApproved,
  commissionRejected,
  paymentFailure,
  subscriptionCancelled,
  passwordReset,
  newApplicationToAdmin,
  applicationApproved,
  invoice,
};

function previewEmail(key, payload) {
  const fn = TEMPLATES[key];
  if (!fn) return null;
  const sample = { ...(PREVIEW_SAMPLES[key] || {}), ...(payload || {}) };
  return fn(sample);
}

module.exports = {
  baseTemplate,
  renderEmail,
  stripHtml,
  previewEmail,
  PREVIEW_SAMPLES,
  TEMPLATES,
  ...TEMPLATES,
};
