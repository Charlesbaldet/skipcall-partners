/**
 * Email Templates for RefBoost
 *
 * Each template returns { subject, html, text }.
 * Templates are designed to be simple, mobile-friendly, and on-brand.
 * Text version is provided as fallback for clients that don't render HTML.
 */

const BRAND_PRIMARY = '#059669';
const BRAND_PRIMARY_DARK = '#047857';
const BG_SOFT = '#f0fdf4';
const TEXT_DARK = '#1f2937';
const TEXT_MUTED = '#6b7280';
const BORDER = '#e5e7eb';

function baseLayout({ title, preheader, tenantName, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG_SOFT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${TEXT_DARK};">
<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${preheader || ''}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_SOFT};padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:${BRAND_PRIMARY};padding:24px 32px;">
<div style="color:#ffffff;font-weight:700;font-size:18px;letter-spacing:-0.01em;">${tenantName || 'RefBoost'}</div>
</td></tr>
<tr><td style="padding:40px 32px 32px;">
<h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:${TEXT_DARK};line-height:1.3;">${title}</h1>
<div style="font-size:15px;line-height:1.6;color:${TEXT_DARK};">${bodyHtml}</div>
${ctaUrl ? `<div style="margin:32px 0 8px;"><a href="${ctaUrl}" style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">${ctaLabel || 'Accéder à mon espace'}</a></div>` : ''}
</td></tr>
<tr><td style="padding:24px 32px;border-top:1px solid ${BORDER};background:#fafafa;">
<p style="margin:0;font-size:12px;color:${TEXT_MUTED};line-height:1.5;">${footerNote || 'Vous recevez cet email parce que vous participez au programme partenaire de ' + (tenantName || 'RefBoost') + '.'}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════
// Template: Partner Invitation
// ═══════════════════════════════════════════════════
function partnerInvite({ recipientName, inviteUrl, tenantName, senderName }) {
  const name = recipientName || 'bonjour';
  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour ${name},</p>
    <p style="margin:0 0 16px;">Nous sommes ravis de vous inviter à rejoindre le programme partenaire de <strong>${tenantName || 'RefBoost'}</strong>.</p>
    <p style="margin:0 0 16px;">En tant que partenaire, vous pourrez nous recommander des prospects qualifiés et percevoir une commission pour chaque deal conclu. Notre plateforme vous permet de suivre en temps réel l'avancement de vos recommandations et vos commissions.</p>
    <p style="margin:0 0 16px;">Pour activer votre compte et définir votre mot de passe, cliquez sur le bouton ci-dessous :</p>
  `;
  const html = baseLayout({
    title: 'Rejoignez notre programme partenaire',
    preheader: `${senderName || (tenantName || 'RefBoost') + ''} vous invite à rejoindre son programme partenaire`,
    tenantName,
    bodyHtml,
    ctaLabel: 'Activer mon compte partenaire',
    ctaUrl: inviteUrl,
    footerNote: `Ce lien d'invitation expire dans 7 jours. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.`,
  });
  return {
    subject: `Invitation au programme partenaire ${tenantName || 'RefBoost'}`,
    html,
    text: `Bonjour ${name},\n\nVous êtes invité(e) à rejoindre le programme partenaire de ${tenantName || 'RefBoost'}.\n\nActivez votre compte : ${inviteUrl}\n\nCe lien expire dans 7 jours.`,
  };
}

// ═══════════════════════════════════════════════════
// Template: Team Member Invitation (admin / commercial)
// ═══════════════════════════════════════════════════
function memberInvite({ recipientName, inviteUrl, tenantName, role, senderName }) {
  const name = recipientName || 'bonjour';
  const roleLabel = role === 'admin' ? 'administrateur' : role === 'commercial' ? 'commercial' : 'membre';
  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour ${name},</p>
    <p style="margin:0 0 16px;"><strong>${senderName || 'L\'équipe'} ${tenantName || ''}</strong> vous invite à rejoindre l'espace de gestion du programme partenaire en tant que <strong>${roleLabel}</strong>.</p>
    <p style="margin:0 0 16px;">Vous aurez accès au tableau de bord, à la gestion des leads, des partenaires et des commissions (selon votre niveau de permission).</p>
    <p style="margin:0 0 16px;">Pour accepter cette invitation et créer votre mot de passe, cliquez sur le bouton ci-dessous :</p>
  `;
  const html = baseLayout({
    title: `Invitation à l'équipe ${tenantName || 'RefBoost'}`,
    preheader: `Vous avez été invité(e) en tant que ${roleLabel}`,
    tenantName,
    bodyHtml,
    ctaLabel: 'Accepter l\'invitation',
    ctaUrl: inviteUrl,
    footerNote: `Ce lien d'invitation expire dans 7 jours.`,
  });
  return {
    subject: `Invitation à l'équipe ${tenantName || 'RefBoost'}`,
    html,
    text: `Bonjour ${name},\n\nVous êtes invité(e) à rejoindre l'équipe de ${tenantName || 'RefBoost'} en tant que ${roleLabel}.\n\nAccepter : ${inviteUrl}\n\nCe lien expire dans 7 jours.`,
  };
}

// ═══════════════════════════════════════════════════
// Template: Lead Won Notification
// ═══════════════════════════════════════════════════
function leadWon({ partnerName, prospectName, dealValue, commissionAmount, currency, dashboardUrl, tenantName }) {
  const name = partnerName || 'Bonjour';
  const cur = currency || '€';
  const dealFormatted = dealValue != null ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(dealValue) + ' ' + cur : '';
  const commissionFormatted = commissionAmount != null ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(commissionAmount) + ' ' + cur : '';
  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour ${name},</p>
    <p style="margin:0 0 16px;">Excellente nouvelle ! Le deal que vous avez recommandé <strong>${prospectName}</strong> vient d'être conclu 🎉</p>
    <div style="margin:24px 0;padding:20px;background:${BG_SOFT};border-radius:10px;border-left:4px solid ${BRAND_PRIMARY};">
      ${dealFormatted ? `<div style="font-size:13px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;">Valeur du deal</div><div style="font-size:20px;font-weight:700;color:${TEXT_DARK};margin-bottom:12px;">${dealFormatted}</div>` : ''}
      ${commissionFormatted ? `<div style="font-size:13px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;">Votre commission</div><div style="font-size:24px;font-weight:700;color:${BRAND_PRIMARY};">${commissionFormatted}</div>` : ''}
    </div>
    <p style="margin:0 0 16px;">Votre commission sera validée puis versée selon les conditions du programme. Vous recevrez un email à chaque étape.</p>
  `;
  const html = baseLayout({
    title: 'Votre recommandation a été conclue 🎉',
    preheader: `Félicitations ! ${prospectName} vient de signer`,
    tenantName,
    bodyHtml,
    ctaLabel: 'Voir dans mon espace',
    ctaUrl: dashboardUrl,
  });
  return {
    subject: `🎉 ${prospectName} vient de signer - votre commission : ${commissionFormatted}`,
    html,
    text: `Bonjour ${name},\n\nExcellente nouvelle ! Le deal ${prospectName} vient d'être conclu.\n${dealFormatted ? 'Valeur: ' + dealFormatted + '\n' : ''}${commissionFormatted ? 'Votre commission: ' + commissionFormatted + '\n' : ''}\nVoir: ${dashboardUrl}`,
  };
}

// ═══════════════════════════════════════════════════
// Template: Commission Validated
// ═══════════════════════════════════════════════════
function commissionValidated({ partnerName, prospectName, commissionAmount, currency, expectedPayoutDate, dashboardUrl, tenantName }) {
  const name = partnerName || 'Bonjour';
  const cur = currency || '€';
  const amountFormatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(commissionAmount) + ' ' + cur;
  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour ${name},</p>
    <p style="margin:0 0 16px;">Votre commission pour le deal <strong>${prospectName}</strong> a été validée et est en attente de paiement.</p>
    <div style="margin:24px 0;padding:20px;background:${BG_SOFT};border-radius:10px;border-left:4px solid ${BRAND_PRIMARY};">
      <div style="font-size:13px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;">Montant validé</div>
      <div style="font-size:24px;font-weight:700;color:${BRAND_PRIMARY};">${amountFormatted}</div>
    </div>
    ${expectedPayoutDate ? `<p style="margin:0 0 16px;">Date de versement prévue : <strong>${expectedPayoutDate}</strong></p>` : ''}
    <p style="margin:0 0 16px;">Vous recevrez un nouvel email dès que le paiement aura été effectué.</p>
  `;
  const html = baseLayout({
    title: 'Votre commission est validée ✓',
    preheader: `Commission validée : ${amountFormatted}`,
    tenantName,
    bodyHtml,
    ctaLabel: 'Voir mes commissions',
    ctaUrl: dashboardUrl,
  });
  return {
    subject: `✓ Commission validée : ${amountFormatted}`,
    html,
    text: `Bonjour ${name},\n\nVotre commission pour ${prospectName} (${amountFormatted}) a été validée.${expectedPayoutDate ? '\nVersement prévu : ' + expectedPayoutDate : ''}\n\nVoir: ${dashboardUrl}`,
  };
}

// ═══════════════════════════════════════════════════
// Template: Commission Paid
// ═══════════════════════════════════════════════════
function commissionPaid({ partnerName, prospectName, commissionAmount, currency, paymentReference, dashboardUrl, tenantName }) {
  const name = partnerName || 'Bonjour';
  const cur = currency || '€';
  const amountFormatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(commissionAmount) + ' ' + cur;
  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour ${name},</p>
    <p style="margin:0 0 16px;">Votre commission pour le deal <strong>${prospectName}</strong> vient d'être versée. Vous devriez la recevoir sur votre compte bancaire sous 1 à 3 jours ouvrés.</p>
    <div style="margin:24px 0;padding:20px;background:${BG_SOFT};border-radius:10px;border-left:4px solid ${BRAND_PRIMARY};">
      <div style="font-size:13px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;">Montant versé</div>
      <div style="font-size:24px;font-weight:700;color:${BRAND_PRIMARY};">${amountFormatted}</div>
      ${paymentReference ? `<div style="margin-top:12px;font-size:13px;color:${TEXT_MUTED};">Référence : <code style="font-family:ui-monospace,monospace;">${paymentReference}</code></div>` : ''}
    </div>
    <p style="margin:0 0 16px;">Merci pour votre confiance et continuez à nous recommander de nouveaux prospects !</p>
  `;
  const html = baseLayout({
    title: 'Votre commission a été versée 💚',
    preheader: `Versement effectué : ${amountFormatted}`,
    tenantName,
    bodyHtml,
    ctaLabel: 'Voir le détail',
    ctaUrl: dashboardUrl,
  });
  return {
    subject: `💚 Votre commission de ${amountFormatted} a été versée`,
    html,
    text: `Bonjour ${name},\n\nVotre commission pour ${prospectName} (${amountFormatted}) vient d'être versée.${paymentReference ? '\nRéférence : ' + paymentReference : ''}\n\nVoir: ${dashboardUrl}`,
  };
}

module.exports = {
  partnerInvite,
  memberInvite,
  leadWon,
  commissionValidated,
  commissionPaid,
  baseLayout,
};
