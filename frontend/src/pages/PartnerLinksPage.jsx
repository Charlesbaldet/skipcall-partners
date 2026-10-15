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
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0e1f18', letterSpacing: -0.5, marginBottom: 4 }}>
          {t('partner_links.title', 'Mes liens')}
        </h1>
        <p style={{ color: '#6e756c' }}>
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
    <div style={{ background: '#fff', border: '1px solid #ded8cb', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef1ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LinkIcon size={18} color="#0e7a54" />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0e1f18' }}>{t('referral_link.title')}</div>
          <div style={{ fontSize: 12, color: '#6e756c', marginTop: 1 }}>{t('referral_link.subtitle')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          readOnly
          value={data.referralLink}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid #ded8cb', fontSize: 13, fontFamily: 'ui-monospace, monospace', color: '#2b3a32', background: '#f6f2e9', boxSizing: 'border-box' }}
          onFocus={e => e.target.select()}
        />
        <button onClick={copy} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--rb-primary, #0e7a54)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Copy size={14} /> {copied ? t('referral_link.copied') : t('referral_link.copy')}
        </button>
        <button onClick={regenerate} disabled={busy} title={t('referral_link.regenerate')} style={{ padding: '10px 12px', borderRadius: 10, background: '#ece7db', color: '#33433b', border: 'none', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
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
    <div style={{ background: accent ? '#e9f1ea' : '#f6f2e9', borderRadius: 10, padding: '12px 14px', border: '1px solid ' + (accent ? '#cfe6d6' : '#ded8cb') }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6e756c', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? '#0e7a54' : '#0e1f18', marginTop: 4 }}>{value}</div>
    </div>
  );
}

// Section 2 — form link. Visible only when the client tenant has
// (a) published a form and (b) generated a token for this partner.
// KPIs are intentionally absent for V1 — they'll come with the
// funnel-instrumentation étape per Charles' plan.
function FormLinkCard({ link, t }) {
  const [mode, setMode] = useState('url'); // 'url' | 'embed'
  const [copied, setCopied] = useState(false);
  const [period, setPeriod] = useState('30d');
  const [stats, setStats] = useState(null);
  // Load funnel stats when we have a token. Period changes refresh
  // in place; nothing to clean up because the request is short-lived.
  useEffect(() => {
    if (!link) { setStats(null); return; }
    api.getPartnerFormStats(period)
      .then(setStats)
      .catch(() => setStats(null));
  }, [link, period]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = link ? origin + '/f/' + link.form_id + '?p=' + link.token : '';
  // The snippet matches what /embed.js parses: data-form-id and
  // data-partner-token are read off the <script> tag, the placeholder
  // <div> is found by id. Keep it copy-pasteable and minimal.
  const snippet = link ? (
`<div id="refboost-form-${link.form_id}"></div>
<script src="${origin}/embed.js" data-form-id="${link.form_id}" data-partner-token="${link.token}" async></script>`
  ) : '';
  const currentText = mode === 'embed' ? snippet : url;

  const copy = () => {
    if (!currentText) return;
    navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!link) {
    return (
      <div style={{ background: '#fff', border: '1px dashed #ded8cb', borderRadius: 16, padding: 24, color: '#6e756c', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f6f2e9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={18} color="#99a09a" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#33433b', marginBottom: 2 }}>
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
    <div style={{ background: '#fff', border: '1px solid #ded8cb', borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef1ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={18} color="#0e7a54" />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0e1f18' }}>
            {t('partner_links.form_title', 'Lien du formulaire')}
          </div>
          <div style={{ fontSize: 12, color: '#6e756c', marginTop: 1 }}>
            {t('partner_links.form_subtitle', { tenant: link.tenant_name, defaultValue: 'Partagez ce lien : les visiteurs remplissent le formulaire d\'inscription configuré par {{tenant}}.' })}
          </div>
        </div>
      </div>

      {/* Mode toggle: direct URL vs HTML/JS snippet for an iframe
          embed. The partner can pick whichever fits their site. Both
          carry the same partner_token so attribution is identical. */}
      <div style={{ display: 'inline-flex', padding: 3, marginBottom: 12, background: '#ece7db', borderRadius: 8 }}>
        {[
          { val: 'url',   label: t('partner_links.mode_direct',  'Lien direct') },
          { val: 'embed', label: t('partner_links.mode_embed',   'Intégrer sur mon site') },
        ].map(opt => {
          const active = mode === opt.val;
          return (
            <button key={opt.val} onClick={() => setMode(opt.val)}
              style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? '#0e1f18' : '#6e756c', fontWeight: 500, fontSize: 12, boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none', fontFamily: 'inherit' }}>
              {opt.label}
            </button>
          );
        })}
      </div>

      {mode === 'url' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            readOnly
            value={url}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid #ded8cb', fontSize: 13, fontFamily: 'ui-monospace, monospace', color: '#2b3a32', background: '#f6f2e9', boxSizing: 'border-box' }}
            onFocus={e => e.target.select()}
          />
          <button onClick={copy} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--rb-primary, #0e7a54)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Copy size={14} /> {copied ? t('referral_link.copied') : t('referral_link.copy')}
          </button>
        </div>
      ) : (
        <div>
          <pre style={{ margin: 0, padding: '12px 14px', borderRadius: 10, border: '2px solid #ded8cb', background: '#f6f2e9', color: '#2b3a32', fontSize: 12, fontFamily: 'ui-monospace, monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <code>{snippet}</code>
          </pre>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#6e756c' }}>
              {t('partner_links.embed_hint', 'Copiez ce code et collez-le dans le HTML de votre site, là où vous voulez afficher le formulaire.')}
            </p>
            <button onClick={copy} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--rb-primary, #0e7a54)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Copy size={12} /> {copied ? t('referral_link.copied') : t('partner_links.copy_code', 'Copier le code')}
            </button>
          </div>
        </div>
      )}

      {/* Funnel KPIs scoped to this partner's token(s). Hidden if
          there's no traffic yet AND no stats response, to avoid
          showing a row of "0 / 0 / 0 %" before the first visit. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18, marginBottom: 10, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#33433b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('partner_links.stats_title', 'Performances')}
        </h4>
        <div style={{ display: 'inline-flex', padding: 2, background: '#ece7db', borderRadius: 7 }}>
          {[
            { v: '7d',  l: t('forms.stats.period_7d',  '7 j') },
            { v: '30d', l: t('forms.stats.period_30d', '30 j') },
            { v: '90d', l: t('forms.stats.period_90d', '90 j') },
            { v: 'all', l: t('forms.stats.period_all', 'Tout') },
          ].map(p => {
            const active = period === p.v;
            return (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                style={{ padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? '#0e1f18' : '#6e756c', fontWeight: 500, fontSize: 11, boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none', fontFamily: 'inherit' }}>
                {p.l}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <PartnerStat label={t('partner_links.stats_views',       'Vues')}       value={stats?.views ?? 0} />
        <PartnerStat label={t('partner_links.stats_submissions', 'Soumissions')} value={stats?.submissions ?? 0} accent />
        <PartnerStat label={t('partner_links.stats_conversion',  'Conversion')}  value={Math.round(((stats?.conversion_rate) || 0) * 100) + ' %'} />
      </div>
    </div>
  );
}

function PartnerStat({ label, value, accent }) {
  return (
    <div style={{ background: accent ? '#e9f1ea' : '#f6f2e9', borderRadius: 10, padding: '10px 12px', border: '1px solid ' + (accent ? '#cfe6d6' : '#ded8cb') }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6e756c', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ? '#0e7a54' : '#0e1f18', marginTop: 4 }}>{value}</div>
    </div>
  );
}
