import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, TrendingUp, DollarSign, Search, ClipboardList, Medal } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import { fmt } from '../lib/constants';
import PageSkeleton from '../components/PageSkeleton.jsx';

// Bar fill for "vers <next level>" — mirrors the admin podium so a
// partner sees the same colour cue when looking at their progression.
const NEXT_LEVEL_BAR = {
  Silver:   '#C0C0C0',
  Gold:     '#FFD700',
  Platinum: '#93c5fd',
};

// Partner landing page. Three KPI tiles + (feature-gated) referral
// link card + promo codes table. The Kanban lives on the dedicated
// "Mes Referrals" page (/partner/referrals) so this view stays
// focused on high-level metrics.
export default function PartnerDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [formStats, setFormStats] = useState(null); // null = no active form link
  const [myLevel, setMyLevel] = useState(null); // partner's own row from /leaderboard
  const [thresholdType, setThresholdType] = useState('deals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getKPIs().catch(() => ({})),
      // 30d window — matches the default in /partner/links so the
      // two numbers line up for the same period the partner is
      // likely to compare.
      api.getPartnerFormStats('30d').catch(() => null),
      // Pull the public leaderboard — the partner is allowed to call
      // it, and we use it as the single source of truth for level
      // assignment (the BE applies the tenant_levels thresholds, we
      // just read the result). Find the partner's own row by ID.
      api.getLeaderboard().catch(() => ({ leaderboard: [], threshold_type: 'deals' })),
    ]).then(([k, fs, lb]) => {
      setKpis(k);
      setFormStats(fs && (fs.submissions != null || fs.views != null) ? fs : null);
      if (lb && Array.isArray(lb.leaderboard)) {
        const me = lb.leaderboard.find(p => p.id === user?.partnerId);
        if (me) setMyLevel(me);
        if (lb.threshold_type) setThresholdType(lb.threshold_type);
      }
    }).finally(() => setLoading(false));
  }, [user?.partnerId]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('layout.nav.dashboard')}</h1>
        <p style={{ color: '#64748b' }}>{t('partnerReferrals.subtitle')}</p>
      </div>

      {myLevel && <MyLevelCard partner={myLevel} thresholdType={thresholdType} t={t} />}

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

// "Mon niveau" card. Sits above the KPI grid on the partner dashboard.
// Reads `partner.next_level.deals_needed` (computed server-side from
// tenant_levels) — no local threshold logic.
function MyLevelCard({ partner: p, thresholdType, t }) {
  const currentValue = thresholdType === 'volume' ? (p.total_revenue || 0) : (p.won_deals || 0);
  const nextLevelTotal = p.next_level ? currentValue + (p.next_level.deals_needed || 0) : 0;
  const progressPct = nextLevelTotal > 0
    ? Math.min(100, Math.max(0, (currentValue / nextLevelTotal) * 100))
    : 0;
  const barFill = (p.next_level && NEXT_LEVEL_BAR[p.next_level.name]) || '#94a3b8';
  const remainingLabel = thresholdType === 'volume'
    ? `${fmt(p.next_level?.deals_needed || 0)} ${t('partner_dashboard.to_go_volume', 'à générer')}`
    : `${Math.round(p.next_level?.deals_needed || 0).toLocaleString('fr-FR')} ${t('partner_dashboard.deals_to_go', 'deals à gagner')}`;
  return (
    <div style={{
      background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 16,
      padding: 20, marginBottom: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 24, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          {t('partner_dashboard.my_level', 'Mon niveau')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Medal size={18} color="var(--rb-primary, #059669)" />
          <span style={{ fontSize: 22, fontWeight: 500, color: '#0f172a', letterSpacing: -0.2 }}>
            {p.level}
          </span>
        </div>
        <div style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>
          {t('partner_dashboard.deals_since_start', { count: p.won_deals || 0, defaultValue: '{{count}} deals gagnés depuis le début' })}
        </div>
      </div>
      <div style={{ minWidth: 220, flex: 1, maxWidth: 360 }}>
        {p.next_level ? (
          <>
            <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>
              {t('dashboard.to_next_level', 'Vers')} {p.next_level.name}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#0f172a', marginBottom: 8 }}>
              {remainingLabel}
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: barFill, borderRadius: 999, transition: 'width .3s' }} />
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', textAlign: 'right' }}>
            {t('partner_dashboard.max_level', 'Vous avez atteint le niveau maximum')}
          </div>
        )}
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
