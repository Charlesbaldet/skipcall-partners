import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LinkIcon, Copy, RotateCcw, FileText } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import { showConfirm, showToast } from '../components/Dialogs.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';

// "Mes liens" — partner-side landing for everything they can share.
// Hosts the redirect link (formerly on the dashboard, moved here) and
// the form-share link the client tenant configured for this partner.
// KPI cards (clicks total / this month) live on the redirect card now
// rather than the dashboard — by design, Charles' brief de-clutters
// the dashboard to push these here.
export default function PartnerLinksPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [features, setFeatures] = useState(null);
  const [formLink, setFormLink] = useState(undefined); // undefined = loading, null = none
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getTenantFeatures().catch(() => ({ features: {} })),
      api.getPartnerFormLink().catch(() => ({ link: null })),
    ]).then(([f, l]) => {
      setFeatures(f.features || {});
      setFormLink(l.link || null);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>
          {t('partner_links.title', 'Mes liens')}
        </h1>
        <p style={{ color: '#64748b' }}>
          {t('partner_links.subtitle', 'Vos liens à partager pour générer des leads attribués à votre compte.')}
        </p>
      </div>

      {features?.feature_referral_links && user?.partnerId && (
        <RedirectLinkCard partnerId={user.partnerId} t={t} />
      )}

      <FormLinkCard link={formLink} t={t} />
    </div>
  );
}

// Section 1 — redirect link. The card and KPIs that used to live on
// the partner dashboard. Same component as before, lifted whole.
function RedirectLinkCard({ partnerId, t }) {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getPartnerReferralLink(partnerId)
      .then(setData)
      .catch(() => setData(null));
  }, [partnerId]);

  if (!data) return null;

  const copy = () => {
    navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerate = async () => {
    const ok = await showConfirm({
      title: t('referral_link.regenerate', 'Régénérer le code'),
      message: t('referral_link.regenerate_confirm'),
      variant: 'warning',
      confirmLabel: t('referral_link.regenerate', 'Régénérer'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.regenerateReferralCode(partnerId);
      const fresh = await api.getPartnerReferralLink(partnerId);
      setData(fresh);
    } catch (e) { showToast.error(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LinkIcon size={18} color="#059669" />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{t('referral_link.title')}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{t('referral_link.subtitle')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          readOnly
          value={data.referralLink}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontFamily: 'ui-monospace, monospace', color: '#334155', background: '#f8fafc', boxSizing: 'border-box' }}
          onFocus={e => e.target.select()}
        />
        <button onClick={copy} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Copy size={14} /> {copied ? t('referral_link.copied') : t('referral_link.copy')}
        </button>
        <button onClick={regenerate} disabled={busy} title={t('referral_link.regenerate')} style={{ padding: '10px 12px', borderRadius: 10, background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
          <RotateCcw size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <LinkStat label={t('referral_link.clicks')} value={data.stats?.total_clicks || 0} accent />
        <LinkStat label={t('referral_link.clicks_month')} value={data.stats?.month_clicks || 0} />
      </div>
    </div>
  );
}

function LinkStat({ label, value, accent }) {
  return (
    <div style={{ background: accent ? '#f0fdf4' : '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid ' + (accent ? '#bbf7d0' : '#e2e8f0') }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? '#059669' : '#0f172a', marginTop: 4 }}>{value}</div>
    </div>
  );
}

// Section 2 — form link. Visible only when the client tenant has
// (a) published a form and (b) generated a token for this partner.
// KPIs are intentionally absent for V1 — they'll come with the
// funnel-instrumentation étape per Charles' plan.
function FormLinkCard({ link, t }) {
  const [copied, setCopied] = useState(false);

  const url = link
    ? (typeof window !== 'undefined' ? window.location.origin : '') + '/f/' + link.form_id + '?p=' + link.token
    : '';

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!link) {
    return (
      <div style={{ background: '#fff', border: '1px dashed #e2e8f0', borderRadius: 16, padding: 24, color: '#64748b', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={18} color="#94a3b8" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 2 }}>
            {t('partner_links.form_empty_title', 'Lien du formulaire')}
          </div>
          <div style={{ fontSize: 12 }}>
            {t('partner_links.form_empty_hint', 'Demandez à votre client de créer un formulaire pour générer des leads via votre site.')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={18} color="#6366f1" />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
            {t('partner_links.form_title', 'Lien du formulaire')}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
            {t('partner_links.form_subtitle', { tenant: link.tenant_name, defaultValue: 'Partagez ce lien : les visiteurs remplissent le formulaire d\'inscription configuré par {{tenant}}.' })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          readOnly
          value={url}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontFamily: 'ui-monospace, monospace', color: '#334155', background: '#f8fafc', boxSizing: 'border-box' }}
          onFocus={e => e.target.select()}
        />
        <button onClick={copy} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Copy size={14} /> {copied ? t('referral_link.copied') : t('referral_link.copy')}
        </button>
      </div>
    </div>
  );
}
