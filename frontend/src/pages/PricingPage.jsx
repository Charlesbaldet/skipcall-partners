import { useState, useEffect, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, Minus, ChevronDown, Zap, Crown } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';

const C = {
  p: '#059669', pl: '#10b981', pd: '#047857',
  s: '#0f172a', sl: '#1e293b',
  a: '#f97316', al: '#fb923c', m: '#64748b', bg: '#fafbfc',
};
const g = (a, b) => `linear-gradient(135deg,${a},${b})`;

function useMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

// ─── Plan catalog (kept in-file so the page renders without a round-trip
//     to /billing). Prices mirror backend/routes/billing.js.
const PLANS = [
  {
    key: 'starter',
    icon: Zap,
    price: { monthly: 0, annual: 0 },
    limitKey: '3',
    popular: false,
    cta: 'cta_starter',
    ctaHref: '/signup',
    ctaVariant: 'outline',
    features: ['row_referral_tracking', 'row_commissions', 'row_partner_portal', 'row_tracking_links', 'row_i18n', 'row_sso', 'row_email_notifs'],
    footnote: 'no_cc',
  },
  {
    key: 'pro',
    icon: Zap,
    price: { monthly: 29, annual: 278 },
    limitKey: '25',
    popular: true,
    cta: 'cta_pro',
    ctaHref: '/signup?plan=pro',
    ctaVariant: 'solid',
    features: ['everything_in_starter', 'row_advanced_analytics', 'row_csv_export', 'row_multi_admin', 'row_priority_support', 'row_news'],
    footnote: 'money_back',
  },
  {
    key: 'business',
    icon: Crown,
    price: { monthly: 79, annual: 758 },
    limitKey: 'unlimited',
    popular: false,
    cta: 'cta_business',
    ctaHref: '/signup?plan=business',
    ctaVariant: 'outline',
    features: ['everything_in_pro', 'row_api', 'row_branding', 'row_dedicated_manager', 'row_crm', 'row_unlimited_partners'],
    footnote: 'money_back',
  },
];

// ─── Comparison table data. Each category holds an array of rows, each
//     row has labels per plan: true = ✓, false = —, 'soon' = coming soon,
//     'num' = custom text value.
const TABLE = [
  { cat: 'cat_partners', rows: [
    { label: 'row_max_partners', values: { starter: '3', pro: '25', business: 'unlimited' } },
    { label: 'row_partner_portal', values: { starter: true, pro: true, business: true } },
    { label: 'row_public_apply',  values: { starter: true, pro: true, business: true } },
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

const FAQ = ['1', '2', '3', '4'];

function Cell({ value, t }) {
  if (value === true) return <Check size={18} color={C.p} style={{ display: 'block', margin: '0 auto' }}/>;
  if (value === false) return <Minus size={16} color="#cbd5e1" style={{ display: 'block', margin: '0 auto' }}/>;
  if (value === 'soon') return <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>{t('pricing.coming_soon')}</span>;
  if (value === 'unlimited') return <span style={{ fontSize: 13, fontWeight: 700, color: C.s }}>∞</span>;
  return <span style={{ fontSize: 14, fontWeight: 700, color: C.s }}>{value}</span>;
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={e => setOpen(e.currentTarget.open)}
      style={{
        borderBottom: '1px solid #f1f5f9', padding: '18px 4px',
        fontFamily: 'inherit',
      }}
    >
      <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: C.s, fontSize: 16, fontWeight: 600 }}>
        <span>{q}</span>
        <ChevronDown size={18} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s' }}/>
      </summary>
      <div style={{ paddingTop: 10, color: C.m, fontSize: 14, lineHeight: 1.6 }}>{a}</div>
    </details>
  );
}

export default function PricingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mobile = useMobile();
  const [interval, setInterval] = useState('monthly');
  const [menuOpen, setMenuOpen] = useState(false);
  const [featOpen, setFeatOpen] = useState(false);

  const featDropdown = [
    { href: '/fonctionnalites/pipeline', label: t('landing.featuresDropdown.pipeline_label'), desc: t('landing.featuresDropdown.pipeline_desc') },
    { href: '/fonctionnalites/commissions', label: t('landing.featuresDropdown.commissions_label'), desc: t('landing.featuresDropdown.commissions_desc') },
    { href: '/fonctionnalites/analytics', label: t('landing.featuresDropdown.analytics_label'), desc: t('landing.featuresDropdown.analytics_desc') },
    { href: '/fonctionnalites/personnalisation', label: t('landing.featuresDropdown.branding_label'), desc: t('landing.featuresDropdown.branding_desc') },
    { href: '/fonctionnalites/tracking', label: t('landing.featuresDropdown.tracking_label'), desc: t('landing.featuresDropdown.tracking_desc') },
  ];

  const section = { padding: mobile ? '64px 20px' : '100px 48px' };

  return (
    <div style={{ fontFamily: 'inherit', color: C.s, background: '#fff' }}>
      <Helmet>
        <title>{t('pricing.hero_title')} · RefBoost</title>
        <meta name="description" content={t('pricing.hero_subtitle')}/>
      </Helmet>

      {/* ─── NAV (mirrors LandingPage so the shell feels consistent) ─── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #f1f5f9', padding: mobile ? '14px 20px' : '16px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.s }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: g(C.p, C.pl), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>R</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>RefBoost</span>
        </a>
        {!mobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <div style={{ position: 'relative' }} onMouseEnter={() => setFeatOpen(true)} onMouseLeave={() => setFeatOpen(false)}>
              <span style={{ color: C.m, fontSize: 14, fontWeight: 500, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4 }}>
                {t('nav.features')} <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke={C.m} strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
              </span>
              {featOpen && (
                <div style={{ position: 'absolute', top: '100%', left: -16, background: '#fff', borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.12)', border: '1px solid #f1f5f9', padding: 8, paddingTop: 16, minWidth: 260, zIndex: 200 }}>
                  {featDropdown.map(({ href, label, desc }) => (
                    <a key={href} href={href} style={{ display: 'block', padding: '10px 14px', borderRadius: 10, textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{label}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{desc}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <a href="/marketplace" style={{ color: C.m, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>{t('nav.marketplace')}</a>
            {/* Pricing: highlighted because we're on this page */}
            <a href="/pricing" style={{ color: C.p, textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>{t('nav.pricing')}</a>
            <a href="/blog" style={{ color: C.m, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>{t('nav.blog')}</a>
            <LanguageSwitcher style={{}}/>
            <button onClick={() => navigate('/login')} style={{ padding: '10px 20px', borderRadius: 10, border: `2px solid ${C.s}`, background: 'transparent', color: C.s, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{t('nav.login')}</button>
            <button onClick={() => navigate('/signup')} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: g(C.p, C.pl), color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{t('nav.freeTrial')}</button>
          </div>
        )}
        {mobile && (
          <button onClick={() => setMenuOpen(v => !v)} style={{ background: 'transparent', border: 'none', padding: 8, cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke={C.s} strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        )}
      </nav>

      {/* Mobile menu overlay */}
      {mobile && menuOpen && (
        <div style={{ position: 'fixed', top: 58, left: 0, right: 0, height: 'calc(100vh - 58px)', zIndex: 200, background: '#fff', overflowY: 'auto', padding: '24px 20px' }}>
          <a href="/marketplace" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '14px 0', borderBottom: '1px solid #f1f5f9', fontSize: 16, fontWeight: 500, color: C.s, textDecoration: 'none' }}>{t('nav.marketplace')}</a>
          <a href="/pricing" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '14px 0', borderBottom: '1px solid #f1f5f9', fontSize: 16, fontWeight: 700, color: C.p, textDecoration: 'none' }}>{t('nav.pricing')}</a>
          <a href="/blog" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '14px 0', borderBottom: '1px solid #f1f5f9', fontSize: 16, fontWeight: 500, color: C.s, textDecoration: 'none' }}>{t('nav.blog')}</a>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
            <button onClick={() => { setMenuOpen(false); navigate('/login'); }} style={{ padding: '14px', borderRadius: 12, border: `2px solid ${C.s}`, background: 'transparent', color: C.s, fontWeight: 600, fontSize: 16, cursor: 'pointer', width: '100%' }}>{t('nav.login')}</button>
            <button onClick={() => { setMenuOpen(false); navigate('/signup'); }} style={{ padding: '14px', borderRadius: 12, border: 'none', background: g(C.p, C.pl), color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', width: '100%' }}>{t('nav.freeTrial')}</button>
          </div>
        </div>
      )}

      {/* ─── HERO ─── */}
      <section style={{ ...section, background: `radial-gradient(ellipse 80% 60% at 50% -20%,${C.p}12,transparent),${C.bg}` }}>
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: mobile ? 34 : 52, fontWeight: 800, letterSpacing: -2, margin: 0, color: C.s, lineHeight: 1.1 }}>
            {t('pricing.hero_title')}
          </h1>
          <p style={{ fontSize: mobile ? 16 : 20, color: C.m, marginTop: 20, lineHeight: 1.55 }}>
            {t('pricing.hero_subtitle')}
          </p>

          {/* Monthly / Annual toggle */}
          <div style={{ marginTop: 36, display: 'inline-flex', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 999, padding: 4, gap: 2 }}>
            {['monthly', 'annual'].map(opt => (
              <button
                key={opt}
                onClick={() => setInterval(opt)}
                style={{
                  padding: '9px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                  background: interval === opt ? C.s : 'transparent',
                  color: interval === opt ? '#fff' : C.m,
                }}
              >
                {t('billing.' + opt)}
                {opt === 'annual' && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: interval === 'annual' ? '#10b981' : C.p, background: interval === 'annual' ? 'rgba(16,185,129,.18)' : '#f0fdf4', padding: '2px 7px', borderRadius: 999 }}>
                    -20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PLAN CARDS ─── */}
      <section style={{ padding: mobile ? '0 20px 64px' : '0 48px 80px', background: C.bg }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 24 }}>
          {PLANS.map(p => {
            const Icon = p.icon;
            const price = p.price[interval];
            const monthlyEquivalent = interval === 'annual' && p.price.annual > 0 ? Math.round(p.price.annual / 12) : null;
            const limitLabel = p.limitKey === 'unlimited' ? t('billing.unlimited') : `${p.limitKey} ${t('billing.partners_used').toLowerCase()}`;
            return (
              <div
                key={p.key}
                style={{
                  background: '#fff',
                  borderRadius: 24,
                  padding: 32,
                  border: p.popular ? `2px solid ${C.p}` : '1px solid #f1f5f9',
                  boxShadow: p.popular ? `0 24px 60px ${C.p}1a` : '0 4px 20px rgba(15,23,42,.04)',
                  position: 'relative',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {p.popular && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: g(C.p, C.pl), color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t('billing.most_popular')}
                  </div>
                )}
                <div style={{ width: 46, height: 46, borderRadius: 12, background: p.popular ? '#f0fdf4' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={22} color={p.popular ? C.p : C.m}/>
                </div>
                <h3 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: C.s }}>{t('billing.' + p.key)}</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  {price === 0
                    ? <span style={{ fontSize: 42, fontWeight: 800 }}>{t('billing.free')}</span>
                    : <>
                        <span style={{ fontSize: 42, fontWeight: 800 }}>
                          {interval === 'annual' ? monthlyEquivalent : price}€
                        </span>
                        <span style={{ color: C.m, fontSize: 14 }}>
                          {interval === 'annual' ? t('pricing.annual_per_month') : t('billing.month')}
                        </span>
                      </>
                  }
                </div>
                {interval === 'annual' && price > 0 && (
                  <div style={{ fontSize: 12, color: C.p, fontWeight: 600, marginBottom: 8 }}>
                    {price}€ {t('billing.per_year').replace('/', '')} · {t('billing.save_20')}
                  </div>
                )}
                <div style={{ fontSize: 14, color: C.p, fontWeight: 700, margin: '10px 0 20px' }}>
                  {limitLabel}
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', fontSize: 14, color: '#334155' }}>
                      <Check size={16} color={C.p} style={{ flexShrink: 0, marginTop: 2 }}/>
                      <span>{t('billing.' + f, { defaultValue: t('pricing.' + f) })}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate(p.ctaHref)}
                  style={{
                    width: '100%', padding: '14px 20px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                    border: p.ctaVariant === 'outline' ? `2px solid ${C.p}` : 'none',
                    background: p.ctaVariant === 'outline' ? '#fff' : g(C.p, C.pl),
                    color: p.ctaVariant === 'outline' ? C.p : '#fff',
                    boxShadow: p.ctaVariant === 'solid' ? `0 8px 30px ${C.p}25` : 'none',
                  }}
                >
                  {t('pricing.' + p.cta)} →
                </button>
                <div style={{ textAlign: 'center', fontSize: 12, color: C.m, marginTop: 14 }}>
                  {t('pricing.' + p.footnote)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── FEATURE COMPARISON TABLE ─── */}
      <section style={{ ...section, background: '#fff' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: mobile ? 28 : 36, fontWeight: 800, letterSpacing: -1.5, margin: 0, color: C.s }}>
              {t('pricing.compare_title')}
            </h2>
            <p style={{ color: C.m, fontSize: 15, marginTop: 10 }}>{t('pricing.compare_sub')}</p>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '18px 20px', fontSize: 13, color: C.m, fontWeight: 600, borderBottom: '1px solid #e2e8f0', background: '#fafbfc' }}>
                    &nbsp;
                  </th>
                  {['starter', 'pro', 'business'].map(k => (
                    <th
                      key={k}
                      style={{
                        textAlign: 'center',
                        padding: '18px 20px',
                        fontSize: 15,
                        fontWeight: 800,
                        color: C.s,
                        borderBottom: k === 'pro' ? `3px solid ${C.p}` : '1px solid #e2e8f0',
                        background: k === 'pro' ? '#f0fdf4' : '#fafbfc',
                        minWidth: 140,
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
                      <td colSpan={4} style={{ padding: '16px 20px 8px', fontSize: 11, fontWeight: 700, color: C.m, textTransform: 'uppercase', letterSpacing: 1, background: '#fafbfc', borderTop: '1px solid #e2e8f0' }}>
                        {t('pricing.' + cat.cat)}
                      </td>
                    </tr>
                    {cat.rows.map(row => (
                      <tr key={'row-' + row.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 20px', fontSize: 14, color: '#334155' }}>
                          {t('pricing.' + row.label)}
                        </td>
                        {['starter', 'pro', 'business'].map(k => (
                          <td key={k} style={{ padding: '12px 20px', textAlign: 'center', background: k === 'pro' ? 'rgba(5,150,105,0.03)' : 'transparent' }}>
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
      </section>

      {/* ─── FAQ ─── */}
      <section style={{ ...section, background: C.bg }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: mobile ? 28 : 36, fontWeight: 800, letterSpacing: -1.5, margin: 0, color: C.s }}>
              {t('pricing.faq_title')}
            </h2>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '4px 24px' }}>
            {FAQ.map(n => (
              <FaqItem
                key={n}
                q={t('pricing.faq_q' + n)}
                a={t('pricing.faq_a' + n)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section style={{ ...section, background: C.s, color: '#fff' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: mobile ? 30 : 42, fontWeight: 800, letterSpacing: -1.5, margin: 0, color: '#fff' }}>
            {t('pricing.final_title')}
          </h2>
          <p style={{ fontSize: 16, color: '#94a3b8', marginTop: 14 }}>{t('pricing.final_subtitle')}</p>
          <div style={{ marginTop: 32, display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => navigate('/signup')} style={{ padding: '14px 28px', borderRadius: 12, border: 'none', background: g(C.p, C.pl), color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 10px 30px ${C.p}40` }}>
              {t('pricing.final_cta_start')} →
            </button>
            <a href="mailto:sales@refboost.io" style={{ padding: '14px 28px', borderRadius: 12, border: '2px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' }}>
              {t('pricing.final_cta_sales')}
            </a>
          </div>
        </div>
      </section>

      {/* ─── FOOTER (mirrors LandingPage) ─── */}
      <footer style={{ padding: '48px 48px 32px', background: C.s, borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '2fr 1fr 1fr 1fr', gap: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: g(C.p, C.pl), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>R</div>
              <span style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>RefBoost</span>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 12, maxWidth: 300 }}>{t('landing.footer.tagline')}</p>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{t('landing.footer.sections.features')}</div>
            {['pipeline', 'commissions', 'analytics', 'branding', 'tracking'].map(k => (
              <a key={k} href={`/fonctionnalites/${k}`} style={{ display: 'block', color: '#64748b', textDecoration: 'none', fontSize: 13, marginBottom: 8 }}>{t(`landing.footer.links.${k}`)}</a>
            ))}
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{t('landing.footer.sections.resources')}</div>
            <a href="/pricing" style={{ display: 'block', color: '#64748b', textDecoration: 'none', fontSize: 13, marginBottom: 8 }}>{t('nav.pricing')}</a>
            <a href="/blog" style={{ display: 'block', color: '#64748b', textDecoration: 'none', fontSize: 13, marginBottom: 8 }}>{t('nav.blog')}</a>
            <a href="/marketplace" style={{ display: 'block', color: '#64748b', textDecoration: 'none', fontSize: 13, marginBottom: 8 }}>{t('nav.marketplace')}</a>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{t('landing.footer.sections.legal')}</div>
            {['terms', 'privacy', 'cookies'].map(k => (
              <a key={k} href="#" style={{ display: 'block', color: '#64748b', textDecoration: 'none', fontSize: 13, marginBottom: 8 }}>{t(`landing.footer.links.${k}`)}</a>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 1180, margin: '32px auto 0', paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.05)', color: '#475569', fontSize: 12, textAlign: 'center' }}>
          {t('landing.footer.copyright')}
        </div>
      </footer>
    </div>
  );
}
