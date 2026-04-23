import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Download, Check, Zap, Crown, AlertCircle, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import ConfirmModal from '../components/ConfirmModal.jsx';

// Plans mirror backend/routes/billing.js — keep price ids in sync.
const PRICE_PRO_MONTHLY = 'price_1TNptZLG65VWFQyt9Dj7QNqt';
const PRICE_BUSINESS_MONTHLY = 'price_1TNptZLG65VWFQytkMfbve38';
// Annual prices are placeholders until real Stripe price IDs are wired
// on the backend via STRIPE_PRICE_PRO_ANNUAL / STRIPE_PRICE_BUSINESS_ANNUAL.
const PRICE_PRO_ANNUAL = 'STRIPE_PRICE_PRO_ANNUAL';
const PRICE_BUSINESS_ANNUAL = 'STRIPE_PRICE_BUSINESS_ANNUAL';

// Returns true only for real Stripe price IDs (they all start with
// `price_`). When the annual IDs haven't been configured yet both
// constants above fall back to their placeholder literal, and we need
// to block the upgrade click — otherwise Stripe rejects the bogus
// price and the button appears to do nothing.
const isRealStripePrice = (id) => typeof id === 'string' && id.startsWith('price_');

const PLAN_META = {
  starter: {
    key: 'starter',
    order: 0,
    icon: Zap,
    limit: 3,
    monthly: { price: 0, priceId: null },
    annual:  { price: 0, priceId: null },
    features: ['plan_pipeline', 'plan_commissions', 'plan_portal', 'plan_i18n'],
  },
  pro: {
    key: 'pro',
    order: 1,
    icon: Zap,
    limit: 25,
    monthly: { price: 29,  priceId: PRICE_PRO_MONTHLY },
    annual:  { price: 278, priceId: PRICE_PRO_ANNUAL },
    features: ['everything_in_starter', 'plan_analytics_advanced', 'plan_csv_export', 'plan_multi_admin', 'plan_priority_support'],
  },
  business: {
    key: 'business',
    order: 2,
    icon: Crown,
    limit: -1,
    monthly: { price: 79,  priceId: PRICE_BUSINESS_MONTHLY },
    annual:  { price: 758, priceId: PRICE_BUSINESS_ANNUAL },
    features: ['everything_in_pro', 'plan_api_access', 'plan_custom_branding', 'plan_dedicated_support', 'plan_unlimited_partners'],
  },
};

// Format a date in the user's active UI language (e.g. "18 avril 2026"
// in French, "April 18, 2026" in English). Falls back to fr-FR if the
// browser can't resolve the locale. Uses month: 'long' for the
// cancellation banners since they need to read naturally in prose.
const fmtDate = (d, locale) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(locale || 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
};

function IntervalToggle({ interval, setInterval, t }) {
  // Hide the annual option entirely until the annual price IDs are
  // configured in Stripe — otherwise we'd offer the user a toggle that
  // breaks every upgrade attempt.
  const annualReady = isRealStripePrice(PRICE_PRO_ANNUAL) && isRealStripePrice(PRICE_BUSINESS_ANNUAL);
  const options = annualReady ? ['monthly', 'annual'] : ['monthly'];
  return (
    <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 999, padding: 4, gap: 2 }}>
      {options.map(opt => (
        <button key={opt} onClick={() => setInterval(opt)}
          style={{
            padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            background: interval === opt ? '#fff' : 'transparent',
            color: interval === opt ? '#0f172a' : '#64748b',
            boxShadow: interval === opt ? '0 1px 4px rgba(15,23,42,.08)' : 'none',
          }}>
          {t('billing.' + opt)}
          {opt === 'annual' && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#059669', background: '#f0fdf4', padding: '2px 6px', borderRadius: 999 }}>
              -20%
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ planKey, interval, t, current, onSelect, busy }) {
  const meta = PLAN_META[planKey];
  const Icon = meta.icon;
  const popular = planKey === 'pro';
  const isCurrent = current === planKey;
  const currentOrder = PLAN_META[current]?.order ?? 0;
  const action = isCurrent ? null : (meta.order > currentOrder ? 'upgrade' : 'downgrade');
  const price = meta[interval].price;
  const limitLabel = meta.limit === -1 ? t('billing.unlimited') : `${meta.limit} ${t('billing.partners_used').toLowerCase()}`;

  return (
    <div style={{
      background: '#fff',
      border: popular ? '2px solid #059669' : '1px solid #e2e8f0',
      borderRadius: 20,
      padding: 28,
      position: 'relative',
      boxShadow: popular ? '0 12px 40px rgba(5,150,105,.12)' : '0 2px 12px rgba(15,23,42,.04)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {popular && (
        <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('billing.most_popular')}
        </div>
      )}
      {isCurrent && (
        <div style={{ position: 'absolute', top: 16, right: 16, background: '#f0fdf4', color: '#059669', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: '1px solid #bbf7d0' }}>
          {t('billing.current')}
        </div>
      )}
      <div style={{ width: 44, height: 44, borderRadius: 12, background: popular ? '#f0fdf4' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Icon size={22} color={popular ? '#059669' : '#64748b'}/>
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{t('billing.' + planKey)}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
        {price === 0
          ? <span style={{ fontSize: 32, fontWeight: 800, color: '#0f172a' }}>{t('billing.free')}</span>
          : <>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#0f172a' }}>{price}€</span>
              <span style={{ color: '#64748b', fontSize: 14 }}>{interval === 'annual' ? t('billing.per_year') : t('billing.month')}</span>
            </>
        }
      </div>
      {interval === 'annual' && price > 0 && (
        <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 8 }}>{t('billing.billed_annually')} · {t('billing.save_20')}</div>
      )}
      <div style={{ fontSize: 14, color: '#059669', fontWeight: 600, margin: '10px 0 16px' }}>
        {limitLabel}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
        {meta.features.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, color: '#334155' }}>
            <Check size={16} color="#059669" style={{ flexShrink: 0 }}/>
            {t('billing.' + f)}
          </li>
        ))}
      </ul>
      <button
        disabled={isCurrent || busy}
        onClick={onSelect}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: 12, border: popular ? 'none' : '1.5px solid #e2e8f0',
          background: isCurrent ? '#f1f5f9' : (popular ? 'linear-gradient(135deg,#059669,#10b981)' : '#fff'),
          color: isCurrent ? '#94a3b8' : (popular ? '#fff' : '#0f172a'),
          fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
          cursor: (isCurrent || busy) ? 'default' : 'pointer',
          boxShadow: (isCurrent || !popular) ? 'none' : '0 6px 18px rgba(5,150,105,.25)',
        }}>
        {isCurrent ? t('billing.current') : (action === 'upgrade' ? t('billing.upgrade') : t('billing.downgrade'))}
      </button>
    </div>
  );
}

export default function BillingPage() {
  const { t, i18n } = useTranslation();
  const uiLocale = (i18n?.language || 'fr').slice(0, 2);
  const [params, setParams] = useSearchParams();
  const [plan, setPlan] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCompare, setShowCompare] = useState(false);
  const [interval, setInterval] = useState('monthly');
  // Modals: cancel-subscription confirmation, plan-change preview.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  // { planKey, preview, loading, error }
  const [changePreview, setChangePreview] = useState(null);
  const [applyingChange, setApplyingChange] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([
      api.getBillingPlan().catch(() => null),
      api.getInvoices().catch(() => ({ invoices: [] })),
    ]).then(([p, inv]) => {
      setPlan(p);
      setInvoices(inv?.invoices || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    // When returning from a successful Stripe Checkout, the second
    // effect below fires the sync+reload — skip the initial reload so
    // the UI doesn't flash "Starter" before the sync completes.
    if (params.get('success') !== '1') reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.get('success') === '1') {
      setSuccess(' ' + t('billing.current_plan'));
      setParams({}, { replace: true });
      // Webhook-less sync: ask the backend to pull the user's latest
      // subscription from Stripe and write the plan back to the tenant
      // row BEFORE we refetch, otherwise the UI still shows "Starter"
      // until a webhook lands (which may never happen in dev).
      api.syncBilling().catch(() => {}).finally(() => reload());
    } else if (params.get('canceled') === '1') {
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ask the user first: if they already have a live subscription, show
  // the pro-rata preview and let them confirm; otherwise (first-time
  // subscribe) go straight to Stripe Checkout.
  const handleCheckout = async (planKey) => {
    const priceId = PLAN_META[planKey]?.[interval]?.priceId;
    console.log('[billing] handleCheckout', { planKey, interval, priceId, hasSub: !!plan?.subscriptionId });
    if (!priceId) { setError('Missing price id for ' + planKey); return; }
    // Guard against unconfigured annual price IDs — they fall back to
    // placeholder literals that Stripe rejects, which makes the button
    // appear to do nothing. Surface a clear error instead.
    if (!isRealStripePrice(priceId)) {
      setError('Ce tarif n\'est pas encore configuré côté Stripe (' + priceId + ').');
      return;
    }

    if (plan?.subscriptionId) {
      // Plan change — preview before applying. Open the modal in a
      // loading state immediately so the user sees something happen
      // even if the preview network call is slow.
      setChangePreview({ planKey, priceId, preview: null, loading: true, error: '' });
      try {
        const p = await api.previewPlanChange(priceId);
        console.log('[billing] previewPlanChange response', p);
        setChangePreview(s => s && s.planKey === planKey ? { ...s, preview: p, loading: false } : s);
      } catch (e) {
        console.error('[billing] previewPlanChange failed', e);
        // Don't close the modal on error — let the user confirm anyway;
        // the actual subscriptions.update on confirm will apply proration
        // itself, so we can still proceed with the upgrade.
        setChangePreview(s => s && s.planKey === planKey ? {
          ...s,
          loading: false,
          error: e.message || 'Preview error',
          preview: { preview_unavailable: true, newPlan: { key: planKey } },
        } : s);
      }
      return;
    }

    // First-time upgrade: hand off to Stripe Checkout.
    setBusy(true); setError('');
    try {
      const resp = await api.createCheckout(priceId);
      console.log('[billing] createCheckout response', resp);
      if (resp.url) { window.location.href = resp.url; return; }
      // Already on this plan (noop) — just reload.
      reload();
    } catch (e) {
      console.error('[billing] createCheckout failed', e);
      setError(e.message || 'Erreur');
    } finally { setBusy(false); }
  };

  // Called from the preview modal after the user confirms.
  const applyPlanChange = async () => {
    if (!changePreview?.priceId) return;
    console.log('[billing] applyPlanChange', changePreview);
    setApplyingChange(true);
    try {
      const resp = await api.createCheckout(changePreview.priceId);
      console.log('[billing] createCheckout (plan change) response', resp);
      if (resp.url) { window.location.href = resp.url; return; }
      setChangePreview(null);
      reload();
      setSuccess(' ' + t('billing.current_plan'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      console.error('[billing] applyPlanChange failed', e);
      setChangePreview(s => s ? { ...s, error: e.message || 'Erreur' } : s);
    } finally {
      setApplyingChange(false);
    }
  };

  const handlePortal = async () => {
    setBusy(true); setError('');
    try { const { url } = await api.createPortal(); if (url) window.location.href = url; }
    catch (e) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const handleCancel = () => setCancelOpen(true);
  const confirmCancel = async () => {
    setCancelBusy(true); setError('');
    try {
      await api.cancelSubscription();
      setCancelOpen(false);
      reload();
    } catch (e) {
      setError(e.message || 'Erreur');
    } finally {
      setCancelBusy(false);
    }
  };

  const handleReactivate = async () => {
    setBusy(true); setError('');
    try {
      await api.reactivateSubscription();
      setSuccess(' ' + t('billing.reactivated'));
      setTimeout(() => setSuccess(''), 3500);
      reload();
    } catch (e) {
      setError(e.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const currentPlanKey = plan?.plan || 'starter';
  const partnerLimit = plan?.partnerLimit ?? 3;
  const partnerCount = plan?.partnerCount ?? 0;
  const limitLabel = partnerLimit === -1 ? t('billing.unlimited') : `${partnerCount} / ${partnerLimit}`;
  const usagePct = partnerLimit === -1 ? 0 : Math.min(100, Math.round((partnerCount / Math.max(partnerLimit, 1)) * 100));
  const over = partnerLimit !== -1 && partnerCount > partnerLimit;

  const money = (n, cur = 'eur') => {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (cur || 'eur').toUpperCase() }).format(n); }
    catch { return n + ' €'; }
  };

  if (loading) return <div style={{ padding: 32, color: '#64748b' }}>Loading…</div>;

  // Prefer the live Stripe cancel_at over the DB planEndsAt so the
  // cancel-confirmation modal + banner always show a real date even
  // when webhooks haven't caught up yet.
  const endDateRaw = plan?.cancelAt || plan?.planEndsAt || null;
  const endLabel = fmtDate(endDateRaw, uiLocale);

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', fontFamily: 'inherit' }}>
      <ConfirmModal
        isOpen={cancelOpen}
        title={t('billing.cancel_title')}
        confirmLabel={t('billing.cancel_yes')}
        cancelLabel={t('billing.keep_my_plan')}
        variant="danger"
        loading={cancelBusy}
        onConfirm={confirmCancel}
        onCancel={() => !cancelBusy && setCancelOpen(false)}
      >
        <p style={{ margin: '0 0 10px' }}>{t('billing.cancel_line_until', { plan: t('billing.' + currentPlanKey), date: endLabel })}</p>
        <p style={{ margin: '0 0 10px' }}>{t('billing.cancel_line_after')}</p>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>{t('billing.cancel_line_partners')}</p>
      </ConfirmModal>

      <PreviewChangeModal
        change={changePreview}
        currentPlanKey={currentPlanKey}
        t={t}
        busy={applyingChange}
        onConfirm={applyPlanChange}
        onCancel={() => !applyingChange && setChangePreview(null)}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <CreditCard size={24} color="#059669"/>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{t('billing.title')}</h1>
      </div>

      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#047857', padding: '12px 16px', borderRadius: 12, fontSize: 14, margin: '16px 0', fontWeight: 500 }}>{success}</div>
      )}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: 12, fontSize: 14, margin: '16px 0' }}>{error}</div>
      )}
      {over && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '14px 16px', borderRadius: 12, fontSize: 14, marginTop: 16 }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }}/>
          <div>{t('billing.over_limit_banner', { count: partnerCount, limit: partnerLimit, plan: t('billing.' + currentPlanKey) })}</div>
        </div>
      )}

      {/* Cancellation scheduled — sub still active until period end. */}
      {plan?.cancelAtPeriodEnd && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '14px 16px', borderRadius: 12, fontSize: 14, marginTop: 16, fontFamily: 'inherit' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }}/>
          <div style={{ flex: 1, fontWeight: 500 }}>
            {t('billing.cancel_scheduled_banner', {
              plan: t('billing.' + currentPlanKey),
              date: fmtDate(plan?.cancelAt || plan?.planEndsAt, uiLocale),
            })}
          </div>
          <button
            onClick={handleReactivate}
            disabled={busy}
            style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: busy ? 0.7 : 1 }}
          >
            {t('billing.reactivate')}
          </button>
        </div>
      )}

      {/* ─── Current plan card ─── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 28, marginTop: 24, boxShadow: '0 2px 12px rgba(15,23,42,.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              {t('billing.current_plan')}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{t('billing.' + currentPlanKey)}</div>
              <div style={{ fontSize: 15, color: '#64748b', fontWeight: 500 }}>
                {PLAN_META[currentPlanKey]?.monthly?.price
                  ? `${PLAN_META[currentPlanKey].monthly.price}€${t('billing.month')}`
                  : t('billing.free')}
              </div>
            </div>
            {plan?.planEndsAt && (
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
                {t('billing.renewal', { date: fmtDate(plan.planEndsAt, uiLocale) })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setShowCompare(s => !s)} style={btnSecondary}>{t('billing.change_plan')}</button>
            {plan?.subscriptionId && (
              <>
                <button onClick={handlePortal} disabled={busy} style={btnSecondary}>{t('billing.manage_payment')}</button>
                {plan?.cancelAtPeriodEnd
                  ? <button onClick={handleReactivate} disabled={busy} style={{ ...btnSecondary, color: '#047857', borderColor: '#bbf7d0' }}>{t('billing.reactivate')}</button>
                  : <button onClick={handleCancel} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>{t('billing.cancel')}</button>}
              </>
            )}
          </div>
        </div>

        {/* Partner usage */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>{t('billing.partners_used')}</span>
            <span>{limitLabel}</span>
          </div>
          {partnerLimit !== -1 && (
            <div style={{ height: 8, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
              <div style={{
                width: usagePct + '%',
                height: '100%',
                background: over ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#059669,#10b981)',
                transition: 'width .4s ease',
              }}/>
            </div>
          )}
        </div>
      </div>

      {/* ─── Plan comparison ─── */}
      {showCompare && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{t('billing.change_plan')}</h2>
            <IntervalToggle interval={interval} setInterval={setInterval} t={t}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
            {['starter', 'pro', 'business'].map(k => (
              <PlanCard
                key={k}
                planKey={k}
                interval={interval}
                t={t}
                current={currentPlanKey}
                busy={busy}
                onSelect={() => {
                  if (k === 'starter') { if (plan?.subscriptionId) handleCancel(); return; }
                  handleCheckout(k);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Invoices ─── */}
      <div style={{ marginTop: 36, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 28, boxShadow: '0 2px 12px rgba(15,23,42,.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{t('billing.invoices')}</h2>
          <button onClick={reload} style={{ ...btnSecondary, padding: '6px 10px', fontSize: 12 }}>
            <RefreshCw size={13}/>
          </button>
        </div>
        {invoices.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>{t('billing.no_invoices')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  <th style={th}>{t('billing.date')}</th>
                  <th style={th}>{t('billing.amount')}</th>
                  <th style={th}>{t('billing.status')}</th>
                  <th style={{ ...th, textAlign: 'right' }}>{t('billing.download')}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => (
                  <tr key={inv.id} style={{ background: idx % 2 ? '#fafbfc' : '#fff' }}>
                    <td style={td}>{fmtDate(inv.date, uiLocale)}</td>
                    <td style={td}>{money(inv.amount, inv.currency)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                        background: inv.status === 'paid' ? '#f0fdf4' : '#fef2f2',
                        color: inv.status === 'paid' ? '#059669' : '#b91c1c',
                        border: `1px solid ${inv.status === 'paid' ? '#bbf7d0' : '#fecaca'}`,
                      }}>
                        {inv.status === 'paid' ? t('billing.paid') : (inv.status === 'open' ? inv.status : t('billing.failed'))}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {inv.pdf_url
                        ? <a href={inv.pdf_url} target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Download size={14}/> PDF
                          </a>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const btnSecondary = {
  background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
  padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#0f172a',
  cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
};
const th = { padding: '10px 12px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' };
const td = { padding: '12px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' };

// Pro-rata preview modal shown before upgrading/downgrading a live
// subscription. Numbers come from GET /billing/preview-change which
// wraps Stripe's upcoming-invoice preview.
function PreviewChangeModal({ change, currentPlanKey, t, busy, onConfirm, onCancel }) {
  if (!change) return null;
  const money = (n, cur = 'eur') => {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (cur || 'eur').toUpperCase() }).format(n); }
    catch { return (n || 0).toFixed(2) + ' €'; }
  };
  const { planKey, preview, loading, error } = change;
  const noop = preview && preview.newPlan?.key === currentPlanKey;
  const previewUnavailable = !!(preview && preview.preview_unavailable);
  // Allow Confirm as soon as we're not loading + not on the same plan.
  // If the preview endpoint failed, Stripe's subscriptions.update will
  // still compute the correct pro-ration on confirm, so we must not
  // leave the user stuck.
  const canConfirm = !loading && !busy && !noop && planKey && planKey !== currentPlanKey;

  return (
    <div
      onClick={() => !busy && onCancel?.()}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', fontFamily: 'inherit' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, boxShadow: '0 25px 80px rgba(15,23,42,0.25)', color: '#0f172a' }}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800 }}>{t('billing.change_plan_title')}</h3>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>
          {t('billing.change_from_to', {
            from: t('billing.' + currentPlanKey),
            to: t('billing.' + planKey),
          })}
        </p>

        {loading && <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b', fontSize: 14 }}>{t('billing.preview_loading')}</div>}

        {error && !loading && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        {preview && !loading && (
          <>
            {noop ? (
              <div style={{ padding: '16px 0', color: '#64748b', fontSize: 14 }}>{t('billing.same_plan')}</div>
            ) : previewUnavailable ? (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 18, fontSize: 13, color: '#475569' }}>
                {t('billing.preview_unavailable_hint') || 'Le détail pro-rata n\'est pas disponible ici, mais Stripe calculera automatiquement le bon montant au changement.'}
              </div>
            ) : (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 18, fontSize: 14 }}>
                {preview.credit < 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#64748b' }}>{t('billing.prorata_credit')}</span>
                    <span style={{ color: '#059669', fontWeight: 600 }}>{money(preview.credit, preview.currency)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8, borderTop: preview.credit < 0 ? '1px solid #e2e8f0' : 'none' }}>
                  <span style={{ fontWeight: 700 }}>{t('billing.due_today')}</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{money(preview.amountDue, preview.currency)}</span>
                </div>
                {preview.nextBillingDate && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>{t('billing.next_billing')}</span>
                    <span>{new Date(preview.nextBillingDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={busy} style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {t('partners.cancel') || 'Annuler'}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: !canConfirm ? '#94a3b8' : 'linear-gradient(135deg,#059669,#10b981)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: !canConfirm ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: !canConfirm ? 'none' : '0 6px 18px rgba(5,150,105,.25)',
            }}
          >
            {busy ? '…' : t('billing.confirm_upgrade')}
          </button>
        </div>
      </div>
    </div>
  );
}
