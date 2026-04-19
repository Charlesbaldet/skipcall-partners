import { useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, Minus, ChevronDown } from 'lucide-react';
import LandingLayout from '../components/LandingLayout';

// Match the colour tokens the Blog/Marketplace pages use so the pricing
// page sits next to them seamlessly.
const SITE = 'https://refboost.io';
const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#f8fafc', card: '#fff' };

// ─── Plan catalog ────────────────────────────────────────────────────
// Mirrors backend/routes/billing.js so signup pricing stays in sync.
const PLANS = [
  {
    key: 'starter',
    price: { monthly: 0, annual: 0 },
    limit: '3',
    popular: false,
    cta: 'cta_starter',
    href: '/signup',
    variant: 'outline',
    features: ['feat_pipeline_kanban', 'feat_commissions', 'feat_partner_portal', 'feat_7_languages', 'feat_google_sso', 'feat_email_notifs'],
    footnote: 'no_cc',
  },
  {
    key: 'pro',
    price: { monthly: 29, annual: 278 },
    limit: '25',
    popular: true,
    cta: 'cta_pro',
    href: '/signup?plan=pro',
    variant: 'solid',
    features: ['feat_everything_starter', 'feat_advanced_analytics', 'feat_csv_export', 'feat_multi_admin', 'feat_priority_support', 'feat_partner_news'],
    footnote: 'money_back',
  },
  {
    key: 'business',
    price: { monthly: 79, annual: 758 },
    limit: 'unlimited',
    popular: false,
    cta: 'cta_business',
    href: '/signup?plan=business',
    variant: 'outline',
    features: ['feat_everything_pro', 'feat_api', 'feat_branding', 'feat_dedicated_support', 'feat_crm_soon', 'feat_unlimited_programs'],
    footnote: 'money_back',
  },
];

// ─── Comparison table data ──────────────────────────────────────────
// `value`: true → ✓ ; false → — ; 'soon' → "Bientôt" ; otherwise raw
// label (numeric or 'unlimited').
const TABLE = [
  { cat: 'cat_partners', rows: [
    { label: 'row_max_partners', values: { starter: '3', pro: '25', business: 'unlimited' } },
    { label: 'row_partner_portal', values: { starter: true, pro: true, business: true } },
    { label: 'row_public_apply', values: { starter: true, pro: true, business: true } },
    { label: 'row_tracking_links', values: { starter: true, pro: true, business: true } },
  ]},
  { cat: 'cat_pipeline', rows: [
    { label: 'row_referral_tracking', values: { starter: true, pro: true, business: true } },
    { label: 'row_kanban', values: { starter: true, pro: true, business: true } },
    { label: 'row_commissions', values: { starter: true, pro: true, business: true } },
    { label: 'row_auto_commission', values: { starter: true, pro: true, business: true } },
  ]},
  { cat: 'cat_comm', rows: [
    { label: 'row_messaging', values: { starter: true, pro: true, business: true } },
    { label: 'row_news', values: { starter: true, pro: true, business: true } },
    { label: 'row_email_notifs', values: { starter: true, pro: true, business: true } },
    { label: 'row_notif_prefs', values: { starter: true, pro: true, business: true } },
  ]},
  { cat: 'cat_analytics', rows: [
    { label: 'row_basic_dashboard', values: { starter: true, pro: true, business: true } },
    { label: 'row_advanced_analytics', values: { starter: false, pro: true, business: true } },
    { label: 'row_csv_export', values: { starter: false, pro: true, business: true } },
  ]},
  { cat: 'cat_admin', rows: [
    { label: 'row_sso', values: { starter: true, pro: true, business: true } },
    { label: 'row_i18n', values: { starter: true, pro: true, business: true } },
    { label: 'row_multi_admin', values: { starter: false, pro: true, business: true } },
    { label: 'row_branding', values: { starter: false, pro: false, business: true } },
    { label: 'row_api', values: { starter: false, pro: false, business: true } },
  ]},
  { cat: 'cat_integrations', rows: [
    { label: 'row_stripe', values: { starter: true, pro: true, business: true } },
    { label: 'row_crm', values: { starter: false, pro: false, business: 'soon' } },
    { label: 'row_webhooks', values: { starter: false, pro: false, business: 'soon' } },
  ]},
  { cat: 'cat_support', rows: [
    { label: 'row_docs', values: { starter: true, pro: true, business: true } },
    { label: 'row_email_support', values: { starter: true, pro: true, business: true } },
    { label: 'row_priority_support', values: { starter: false, pro: true, business: true } },
    { label: 'row_dedicated_manager', values: { starter: false, pro: false, business: true } },
  ]},
];

const FAQ_KEYS = ['1', '2', '3', '4'];

function Cell({ value, t }) {
  if (value === true) return <Check size={18} color={C.p} style={{ display: 'block', margin: '0 auto' }}/>;
  if (value === false) return <Minus size={16} color="#cbd5e1" style={{ display: 'block', margin: '0 auto' }}/>;
  if (value === 'soon') return <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{t('pricing.coming_soon')}</span>;
  if (value === 'unlimited') return <span style={{ fontSize: 14, fontWeight: 700, color: C.s }}>∞</span>;
  return <span style={{ fontSize: 14, fontWeight: 700, color: C.s }}>{value}</span>;
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={e => setOpen(e.currentTarget.open)}
      style={{
        background: C.card, borderRadius: 14,
        boxShadow: '0 2px 12px rgba(0,0,0,.06)',
        padding: '18px 22px', marginBottom: 12, fontFamily: 'inherit',
      }}
    >
      <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: C.s, fontSize: 16, fontWeight: 700 }}>
        <span>{q}</span>
        <ChevronDown size={18} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s', flexShrink: 0 }}/>
      </summary>
      <div style={{ paddingTop: 12, color: C.m, fontSize: 14, lineHeight: 1.6 }}>{a}</div>
    </details>
  );
}

export default function PricingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [interval, setInterval] = useState('monthly');

  return (
    <LandingLayout>
      <Helmet>
        <title>{`${t('pricing.hero_title')} — RefBoost`}</title>
        <meta name="description" content={t('pricing.hero_subtitle')}/>
        <meta property="og:title" content={`${t('pricing.hero_title')} — RefBoost`}/>
        <meta property="og:description" content={t('pricing.hero_subtitle')}/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content={SITE + '/pricing'}/>
        <meta name="twitter:card" content="summary_large_image"/>
        <link rel="canonical" href={SITE + '/pricing'}/>
      </Helmet>

      {/* ─── HERO (mirrors Blog & Marketplace dark navy hero) ─── */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '72px 24px 64px', textAlign: 'center' }}>
        <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: C.pl, textTransform: 'uppercase', letterSpacing: 2 }}>
          {t('nav.pricing')}
        </p>
        <h1 style={{ margin: '0 0 16px', fontSize: 44, fontWeight: 800, color: '#fff', lineHeight: 1.15 }}>
          {t('pricing.hero_title')}
        </h1>
        <p style={{ margin: '0 auto 32px', fontSize: 18, color: '#94a3b8', maxWidth: 560, lineHeight: 1.6 }}>
          {t('pricing.hero_subtitle')}
        </p>

        {/* Monthly / Annual toggle (centered like the Marketplace search bar). */}
        <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: 4, gap: 2 }}>
          {['monthly', 'annual'].map(opt => (
            <button
              key={opt}
              onClick={() => setInterval(opt)}
              style={{
                padding: '10px 22px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                background: interval === opt ? '#fff' : 'transparent',
                color: interval === opt ? C.s : '#cbd5e1',
                transition: 'all .15s',
              }}
            >
              {t('billing.' + opt)}
              {opt === 'annual' && (
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: C.p, background: '#f0fdf4', padding: '2px 7px', borderRadius: 999 }}>
                  -20%
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ─── PLAN CARDS ─── */}
      <main style={{ background: C.bg, padding: '48px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {PLANS.map(p => {
            const price = p.price[interval];
            const monthlyEquivalent = interval === 'annual' && p.price.annual > 0 ? Math.round(p.price.annual / 12) : null;
            const limitLabel = p.limit === 'unlimited'
              ? t('billing.unlimited')
              : `${p.limit} ${t('billing.partners_used').toLowerCase()}`;
            return (
              <article
                key={p.key}
                style={{
                  background: C.card,
                  borderRadius: 16,
                  padding: 28,
                  boxShadow: '0 2px 12px rgba(0,0,0,.06)',
                  border: p.popular ? `2px solid ${C.p}` : '1px solid transparent',
                  display: 'flex', flexDirection: 'column',
                  position: 'relative',
                  transition: 'transform .2s, box-shadow .2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.06)'; }}
              >
                {p.popular && (
                  <span style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: C.p, color: '#fff',
                    fontSize: 11, fontWeight: 700, padding: '4px 12px',
                    borderRadius: 20, textTransform: 'uppercase', letterSpacing: 1,
                  }}>
                    {t('pricing.popular') || t('billing.most_popular')}
                  </span>
                )}

                <h3 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: C.s }}>
                  {t('billing.' + p.key)}
                </h3>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  {price === 0
                    ? <span style={{ fontSize: 40, fontWeight: 800, color: C.p }}>{t('billing.free')}</span>
                    : <>
                        <span style={{ fontSize: 40, fontWeight: 800, color: C.s }}>
                          {interval === 'annual' ? monthlyEquivalent : price}€
                        </span>
                        <span style={{ color: C.m, fontSize: 14 }}>{t('billing.month')}</span>
                      </>
                  }
                </div>
                {interval === 'annual' && price > 0 && (
                  <div style={{ fontSize: 12, color: C.p, fontWeight: 600, marginBottom: 8 }}>
                    {price}€{t('billing.per_year')} · {t('billing.save_20')}
                  </div>
                )}

                <div style={{ fontSize: 14, color: C.p, fontWeight: 700, margin: '10px 0 18px' }}>
                  {limitLabel}
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                      <Check size={16} color={C.p} style={{ flexShrink: 0, marginTop: 2 }}/>
                      <span>{t('pricing.' + f)}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate(p.href)}
                  style={{
                    width: '100%', padding: '12px 18px', borderRadius: 12, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                    border: p.variant === 'outline' ? `1.5px solid ${C.p}` : 'none',
                    background: p.variant === 'outline' ? 'transparent' : `linear-gradient(135deg, ${C.p}, ${C.pl})`,
                    color: p.variant === 'outline' ? C.p : '#fff',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => {
                    if (p.variant === 'outline') {
                      e.currentTarget.style.background = C.p;
                      e.currentTarget.style.color = '#fff';
                    }
                  }}
                  onMouseLeave={e => {
                    if (p.variant === 'outline') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = C.p;
                    }
                  }}
                >
                  {t('pricing.' + p.cta)} →
                </button>

                <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: C.m }}>
                  {t('pricing.' + p.footnote)}
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {/* ─── COMPARISON TABLE ─── */}
      <section style={{ background: C.bg, padding: '40px 24px 64px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', margin: '0 0 32px', fontSize: 28, fontWeight: 800, color: C.s }}>
            {t('pricing.compare_title')}
          </h2>
          <div style={{ background: C.card, borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,.06)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '18px 20px', fontSize: 13, color: C.m, fontWeight: 600 }}>&nbsp;</th>
                    {['starter', 'pro', 'business'].map(k => (
                      <th
                        key={k}
                        style={{
                          textAlign: 'center', padding: '18px 20px',
                          fontSize: 15, fontWeight: 800, color: C.s, minWidth: 140,
                          background: k === 'pro' ? '#f0fdf4' : 'transparent',
                          borderBottom: k === 'pro' ? `3px solid ${C.p}` : 'none',
                        }}
                      >
                        {t('billing.' + k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TABLE.map(cat => (
                    <Fragment key={cat.cat}>
                      <tr>
                        <td colSpan={4} style={{ padding: '14px 20px 6px', fontSize: 11, fontWeight: 700, color: C.m, textTransform: 'uppercase', letterSpacing: 1, background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                          {t('pricing.' + cat.cat)}
                        </td>
                      </tr>
                      {cat.rows.map(row => (
                        <tr key={'row-' + row.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 20px', fontSize: 14, color: '#334155' }}>
                            {t('pricing.' + row.label)}
                          </td>
                          {['starter', 'pro', 'business'].map(k => (
                            <td key={k} style={{ padding: '12px 20px', textAlign: 'center', background: k === 'pro' ? 'rgba(5,150,105,0.04)' : 'transparent' }}>
                              <Cell value={row.values[k]} t={t}/>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section style={{ background: '#fff', padding: '56px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', margin: '0 0 28px', fontSize: 28, fontWeight: 800, color: C.s }}>
            {t('pricing.faq_title')}
          </h2>
          {FAQ_KEYS.map(n => (
            <FaqItem
              key={n}
              q={t('pricing.faq_q' + n)}
              a={t('pricing.faq_a' + n)}
            />
          ))}
        </div>
      </section>

      {/* ─── FINAL CTA (dark navy, like the landing page CTA) ─── */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '72px 24px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>
          {t('pricing.final_title')}
        </h2>
        <p style={{ margin: '0 0 32px', fontSize: 16, color: '#94a3b8' }}>{t('pricing.final_subtitle')}</p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/signup')}
            style={{ padding: '14px 28px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${C.p}, ${C.pl})`, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 10px 30px ${C.p}40` }}
          >
            {t('pricing.final_cta_start')} →
          </button>
          <a
            href="mailto:sales@refboost.io"
            style={{ padding: '14px 28px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' }}
          >
            {t('pricing.final_cta_sales')}
          </a>
        </div>
      </section>
    </LandingLayout>
  );
}
