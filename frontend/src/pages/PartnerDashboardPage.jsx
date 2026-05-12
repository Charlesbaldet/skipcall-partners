import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, TrendingUp, DollarSign, Search, ClipboardList } from 'lucide-react';
import api from '../lib/api';
import { fmt } from '../lib/constants';
import PageSkeleton from '../components/PageSkeleton.jsx';

// Partner landing page. Three KPI tiles + (feature-gated) referral
// link card + promo codes table. The Kanban lives on the dedicated
// "Mes Referrals" page (/partner/referrals) so this view stays
// focused on high-level metrics.
export default function PartnerDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [formStats, setFormStats] = useState(null); // null = no active form link
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getKPIs().catch(() => ({})),
      // 30d window — matches the default in /partner/links so the
      // two numbers line up for the same period the partner is
      // likely to compare.
      api.getPartnerFormStats('30d').catch(() => null),
    ]).then(([k, fs]) => {
      setKpis(k);
      // Only surface the tile when the partner actually has a form
      // link active (i.e. the BE returned a non-null shape with a
      // submissions count >= 0). Zero-traffic forms still show.
      setFormStats(fs && (fs.submissions != null || fs.views != null) ? fs : null);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;

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
        {formStats && (
          <PKPI icon={ClipboardList}
            label={t('partner_dashboard.form_submissions', 'Réponses formulaire')}
            value={formStats.submissions || 0}
            sub={t('partner_dashboard.form_submissions_sub', 'sur 30 jours')}
            color="#6366f1" />
        )}
      </div>

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


// ReferralLinkCard + LinkStat moved to PartnerLinksPage (Mes liens).
