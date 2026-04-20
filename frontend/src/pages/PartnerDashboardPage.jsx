import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, TrendingUp, DollarSign, Search, Link as LinkIcon, Copy, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
      {features?.feature_promo_codes && user?.partnerId && (
        <PartnerPromoCodes partnerId={user.partnerId} />
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <LinkStat label={t('referral_link.clicks')} value={data.stats?.total_clicks || 0} />
        <LinkStat label={t('referral_link.clicks_month')} value={data.stats?.month_clicks || 0} />
        <LinkStat label={t('referral_link.conversions')} value={data.stats?.conversions || 0} accent />
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

// ═══ Partner promo codes (CRUD) ═══
function PartnerPromoCodes({ partnerId }) {
  const { t } = useTranslation();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', discountType: 'percentage', discountValue: '10', description: '', maxUses: '', expiresAt: '' });
  const [err, setErr] = useState(null);

  const reload = () => {
    setLoading(true);
    api.getPartnerPromoCodes()
      .then(d => setCodes(d.promoCodes || []))
      .catch(() => setCodes([]))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const create = async () => {
    setErr(null);
    try {
      await api.createPromoCode({ ...form, partnerId });
      setCreating(false);
      setForm({ code: '', discountType: 'percentage', discountValue: '10', description: '', maxUses: '', expiresAt: '' });
      reload();
    } catch (e) { setErr(e.message); }
  };

  const toggleActive = async (c) => {
    try {
      await api.updatePromoCode(c.id, { isActive: !c.is_active });
      reload();
    } catch (e) { alert(e.message); }
  };
  const remove = async (c) => {
    if (!window.confirm(t('promo_code.delete_confirm'))) return;
    try { await api.deletePromoCode(c.id); reload(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{t('promo_code.title')}</div>
        <button onClick={() => setCreating(true)} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {t('promo_code.create')}
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>…</div>
      ) : codes.length === 0 ? (
        <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center', fontSize: 14 }}>{t('promo_code.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {codes.map(c => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 120px 100px', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: c.is_active ? '#f8fafc' : '#fef2f2', border: '1px solid ' + (c.is_active ? '#e2e8f0' : '#fecaca') }}>
              <div>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#0f172a' }}>{c.code}</div>
                {c.description && <div style={{ fontSize: 12, color: '#64748b' }}>{c.description}</div>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>
                {c.discount_type === 'percentage' ? `${parseFloat(c.discount_value)}%` : `${parseFloat(c.discount_value)}€`}
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {c.current_uses || 0}{c.max_uses ? ` / ${c.max_uses}` : ` / ${t('promo_code.unlimited')}`}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: c.is_active ? '#f0fdf4' : '#fef2f2', color: c.is_active ? '#059669' : '#dc2626', width: 'fit-content' }}>
                {c.is_active ? t('promo_code.active') : t('promo_code.inactive')}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => { navigator.clipboard.writeText(c.code); }} style={{ padding: 6, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} title={t('referral_link.copy')}>
                  <Copy size={14} />
                </button>
                <button onClick={() => toggleActive(c)} style={{ padding: '4px 8px', borderRadius: 6, background: c.is_active ? '#fff' : '#059669', color: c.is_active ? '#64748b' : '#fff', border: '1px solid ' + (c.is_active ? '#e2e8f0' : '#059669'), cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  {c.is_active ? t('promo_code.inactive') : t('promo_code.active')}
                </button>
                <button onClick={() => remove(c)} style={{ padding: 6, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div onClick={() => setCreating(false)} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>{t('promo_code.create')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.code')}</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SEBDU20" style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.discount_type')}</label>
                  <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}>
                    <option value="percentage">{t('promo_code.percentage')}</option>
                    <option value="fixed">{t('promo_code.fixed')}</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.discount_value')}</label>
                  <input type="number" min="0" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.description')}</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.max_uses')}</label>
                  <input type="number" min="0" placeholder={t('promo_code.unlimited')} value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.expires_at')}</label>
                  <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              {err && <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setCreating(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{t('common.cancel')}</button>
                <button onClick={create} style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{t('common.save')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
