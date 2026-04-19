import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Zap, Crown, AlertCircle, Check } from 'lucide-react';
import api from '../lib/api';

const PRICE_PRO_MONTHLY = 'price_1TNptZLG65VWFQyt9Dj7QNqt';
const PRICE_BUSINESS_MONTHLY = 'price_1TNptZLG65VWFQytkMfbve38';

const TIERS = {
  pro: {
    key: 'pro', price: 29, partnerLabel: '25',
    priceId: PRICE_PRO_MONTHLY, icon: Zap,
    features: ['plan_analytics_advanced', 'plan_csv_export', 'plan_multi_admin', 'plan_priority_support'],
  },
  business: {
    key: 'business', price: 79, partnerLabel: 'unlimited',
    priceId: PRICE_BUSINESS_MONTHLY, icon: Crown,
    features: ['plan_api_access', 'plan_custom_branding', 'plan_dedicated_support', 'plan_unlimited_partners'],
  },
};

export default function UpgradeModal({ limit, plan, upgradeTo, onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Show both Pro + Business when currently on Starter, else hide the
  // user's current plan so the choice is always about upgrading.
  const availableTiers = plan === 'starter' ? ['pro', 'business'] : ['business'];

  const handleUpgrade = async (tierKey) => {
    setBusy(true); setError('');
    try {
      const resp = await api.createCheckout(TIERS[tierKey].priceId);
      if (resp?.url) { window.location.href = resp.url; return; }
      // In-place update (already has a live sub) — close the modal and
      // land the user on /billing so they see the new plan + usage.
      onClose?.();
      navigate('/billing?success=1');
    } catch (e) {
      setError(e.message || 'Erreur Stripe');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}/>
      <div style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 640, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', padding: 32, fontFamily: 'inherit' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: '#f1f5f9', border: 'none', borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={16}/>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={22} color="#b45309"/>
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{t('billing.partner_limit_reached')}</h2>
        </div>
        <p style={{ color: '#475569', fontSize: 14, margin: '0 0 24px', lineHeight: 1.55 }}>
          {t('billing.upgrade_message', { plan: t('billing.' + (plan || 'starter')), limit })}
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: availableTiers.length === 2 ? '1fr 1fr' : '1fr', gap: 14 }}>
          {availableTiers.map(key => {
            const tier = TIERS[key];
            const Icon = tier.icon;
            const highlight = key === upgradeTo || key === 'pro';
            return (
              <div key={key} style={{
                border: highlight ? '2px solid #059669' : '1.5px solid #e2e8f0',
                borderRadius: 16, padding: 20,
                background: highlight ? '#f0fdf4' : '#fff',
                position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} color="#059669"/>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{t('billing.' + key)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{tier.price}€</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{t('billing.month')}</div>
                </div>
                <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 10 }}>
                  {tier.partnerLabel === 'unlimited' ? t('billing.unlimited') : `${tier.partnerLabel} ${t('billing.partners_used').toLowerCase()}`}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                  {tier.features.map(f => (
                    <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0', fontSize: 12, color: '#475569' }}>
                      <Check size={14} color="#059669" style={{ flexShrink: 0, marginTop: 2 }}/>
                      {t('billing.' + f)}
                    </li>
                  ))}
                </ul>
                <button
                  disabled={busy}
                  onClick={() => handleUpgrade(key)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 10,
                    border: 'none', background: 'linear-gradient(135deg,#059669,#10b981)',
                    color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                    cursor: busy ? 'wait' : 'pointer',
                    boxShadow: '0 6px 18px rgba(5,150,105,.25)',
                  }}>
                  {t('billing.upgrade')} — {t('billing.' + key)} ({tier.price}€{t('billing.month')})
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => { onClose(); navigate('/billing'); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
            {t('billing.title')}
          </button>
        </div>
      </div>
    </div>
  );
}
