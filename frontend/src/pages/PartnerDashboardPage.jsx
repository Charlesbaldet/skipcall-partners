import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, TrendingUp, DollarSign, Search, Link as LinkIcon, Copy, RotateCcw } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import { fmt } from '../lib/constants';

// Partner landing page. Three KPI tiles + (feature-gated) referral
// link card + promo codes table. The Kanban lives on the dedicated
// "Mes Referrals" page (/partner/referrals) so this view stays
// focused on high-level metrics.
export default function PartnerDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getKPIs().catch(() => ({})),
      api.getTenantFeatures().catch(() => ({ features: {} })),
    ]).then(([k, f]) => {
      setKpis(k);
      setFeatures(f.features || {});
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('partnerReferrals.loading')}</div>;

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('layout.nav.dashboard')}</h1>
        <p style={{ color: '#64748b' }}>{t('partnerReferrals.subtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <PKPI icon={FileText} label={t('partnerReferrals.kpi_total')} value={kpis?.total_referrals || 0} color="var(--rb-primary, #059669)" />
        <PKPI icon={TrendingUp} label={t('partnerReferrals.kpi_won')} value={kpis?.won_count || 0} sub={fmt(kpis?.total_revenue || 0)} color="#16a34a" />
        <PKPI icon={DollarSign} label={t('partnerReferrals.kpi_commission')} value={fmt(kpis?.total_commission || 0)} color="var(--rb-accent, #f97316)" />
      </div>

      {features?.feature_referral_links && user?.partnerId && (
        <ReferralLinkCard partnerId={user.partnerId} />
      )}

      <div
        onClick={() => navigate('/marketplace')}
        style={{
          marginTop: 32,
          padding: '16px 20px',
          background: 'rgba(5,150,105,0.05)',
          border: '1px solid rgba(5,150,105,0.18)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', gap: 14,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.05)'; }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(5,150,105,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Search size={18} color="#059669"/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {t('partnerReferrals.discover_title') || 'Découvrez d\'autres programmes partenaires'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {t('partnerReferrals.discover_subtitle') || 'Trouvez de nouveaux programmes à recommander.'}
          </div>
        </div>
        <span style={{ color: '#059669', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {t('partnerReferrals.explore_marketplace') || 'Explorer la marketplace'} →
        </span>
      </div>
    </div>
  );
}

function PKPI({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
          {sub && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
    </div>
  );
}

// ═══ Referral link card ═══
function ReferralLinkCard({ partnerId }) {
  const { t } = useTranslation();
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
    if (!window.confirm(t('referral_link.regenerate_confirm'))) return;
    setBusy(true);
    try {
      await api.regenerateReferralCode(partnerId);
      const fresh = await api.getPartnerReferralLink(partnerId);
      setData(fresh);
    } catch (e) { alert(e.message); }
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
