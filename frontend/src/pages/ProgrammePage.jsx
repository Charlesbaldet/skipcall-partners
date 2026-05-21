import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';
import {
  Trophy, Plus, Edit2,
  Palette,
  Link2,
  X, User, Users, Lock, Eye, EyeOff, UserPlus, Shield, Briefcase,
  CheckCircle, Copy, ToggleLeft, ToggleRight, Plug, Key, Trash2, ExternalLink, GripVertical,
} from 'lucide-react';

export default function ProgrammePage() {
  const { t } = useTranslation();
  const [data, setData] = useState({ levels: [], threshold_type: 'deals' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // level id or 'new'
  const [form, setForm] = useState({ name: '', icon: '⭐', color: '#94a3b8', min_threshold: 0, commission_rate: 10, longevity_mode: 'limited', longevity_months: 12, setup_rate: '' });
  // { kind: 'delete'|'reset', id? }
  const [confirmAction, setConfirmAction] = useState(null);
  const [msg, setMsg] = useState(null);
  // Recurring-billing feature flag — read here only to conditionally
  // expose the per-tier longevity inputs (E2-bis). The master
  // toggle was moved to Paramètres → Commission during E5; this
  // page no longer owns the write path.
  const [recurringBilling, setRecurringBilling] = useState(false);
  // G2/H1 — business_model du tenant. 'hybrid' débloque setup_rate
  // par tier. 'forfait_tjm' masque les paramètres récurrents
  // (longevity_mode/months — concepts non-applicables au one-shot).
  // 'mrr' (défaut) : comportement historique.
  const [businessModel, setBusinessModel] = useState('mrr');

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getTenantLevels();
      setData({ levels: d.levels || [], threshold_type: d.threshold_type || 'deals' });
      const mt = await api.getMyTenant();
      const t0 = mt && (mt.tenant || mt);
      setRecurringBilling(!!t0?.recurring_billing_enabled);
      setBusinessModel(t0?.business_model || 'mrr');
    } catch (e) {
      setMsg({ type: 'error', text: e.message || t('common.error') });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setType = async (type) => {
    try {
      await api.setTenantLevelThresholdType(type);
      setData(d => ({ ...d, threshold_type: type }));
      setMsg({ type: 'success', text: t('programme.saved') });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const startEdit = (l) => {
    setForm({
      name: l.name || '',
      icon: l.icon || '⭐',
      color: l.color || '#94a3b8',
      min_threshold: parseFloat(l.min_threshold) || 0,
      commission_rate: parseFloat(l.commission_rate) || 10,
      longevity_mode:   l.longevity_mode   || 'limited',
      longevity_months: l.longevity_months != null ? parseInt(l.longevity_months, 10) : 12,
      // G2 — pré-remplissage setup_rate. NULL côté DB → champ vide
      // côté UI ; nombre → string pour l'input controlled.
      setup_rate: l.setup_rate != null ? String(parseFloat(l.setup_rate)) : '',
    });
    setEditing(l.id);
  };

  const startNew = () => {
    setForm({ name: '', icon: '⭐', color: '#94a3b8', min_threshold: 0, commission_rate: 10, longevity_mode: 'limited', longevity_months: 12, setup_rate: '' });
    setEditing('new');
  };

  const save = async () => {
    if (!form.name) { setMsg({ type: 'error', text: t('programme.name_required') }); return; }
    try {
      if (editing === 'new') {
        await api.createTenantLevel({ ...form, position: data.levels.length });
      } else {
        await api.updateTenantLevel(editing, form);
      }
      setEditing(null);
      await load();
      setMsg({ type: 'success', text: t('programme.level_saved') });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || t('common.error') });
    }
  };

  const del = (id) => setConfirmAction({ kind: 'delete', id });
  const reset = () => setConfirmAction({ kind: 'reset' });
  const runConfirm = async () => {
    if (!confirmAction) return;
    try {
      if (confirmAction.kind === 'delete') await api.deleteTenantLevel(confirmAction.id);
      else await api.resetTenantLevels();
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setConfirmAction(null);
    }
  };

  if (loading) return <PageSkeleton />;

  const isDeal = data.threshold_type === 'deals';
  const unitLabel = isDeal ? t('programme.unit_deals') : t('programme.unit_volume');
  const thresholdInputLabel = isDeal ? t('programme.threshold_deals') : t('programme.threshold_volume');

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 11, marginBottom: 4 };

  const formBlock = (
    <div style={{ padding: 16, background: '#fffbeb', borderRadius: 12, border: '2px dashed #fbbf24', marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>{t('programme.level_name')}</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('programme.level_name_placeholder')} />
        </div>
        <div>
          <label style={labelStyle}>{t('programme.level_icon')}</label>
          <input style={{ ...inputStyle, textAlign: 'center', fontSize: 18 }} value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} maxLength="2" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>{t('programme.level_color')}</label>
          <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...inputStyle, height: 36, padding: 2, cursor: 'pointer' }} />
        </div>
        <div>
          <label style={labelStyle}>{thresholdInputLabel}</label>
          <input type="number" min="0" step={isDeal ? '1' : '100'} style={inputStyle} value={form.min_threshold} onChange={e => setForm(f => ({ ...f, min_threshold: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div>
          <label style={labelStyle}>{t('programme.level_rate')}</label>
          <input type="number" min="0" max="100" step="0.5" style={inputStyle} value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>
      {/* Longévité de la commission par palier (E2 refonte). Visible
          uniquement quand le tenant a activé la facturation récurrente —
          sinon le réglage n'existe pas pour ce tenant et le bloc reste
          identique au pré-E2. */}
      {recurringBilling && businessModel !== 'forfait_tjm' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>{t('programme.level_longevity_mode', 'Longévité')}</label>
            <select
              style={inputStyle}
              value={form.longevity_mode}
              onChange={e => setForm(f => ({ ...f, longevity_mode: e.target.value }))}
            >
              <option value="limited">{t('programme.longevity_limited', 'Durée limitée')}</option>
              <option value="lifetime">{t('programme.longevity_lifetime', 'À vie')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('programme.level_longevity_months', 'Mois')}</label>
            <input
              type="number"
              min="1"
              step="1"
              disabled={form.longevity_mode === 'lifetime'}
              value={form.longevity_mode === 'lifetime' ? '' : form.longevity_months}
              onChange={e => setForm(f => ({ ...f, longevity_months: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
              style={{
                ...inputStyle,
                color: form.longevity_mode === 'lifetime' ? '#94a3b8' : '#0f172a',
                background: form.longevity_mode === 'lifetime' ? '#f1f5f9' : '#fff',
                cursor: form.longevity_mode === 'lifetime' ? 'not-allowed' : 'text',
              }}
              placeholder={form.longevity_mode === 'lifetime' ? t('programme.longevity_na', '—') : '12'}
            />
          </div>
        </div>
      )}
      {/* G2 — % Setup par tier. Visible uniquement en business_model
          'hybrid'. Vide = tier sans setup (commission setup = 0).
          NUMERIC(5,2) côté DB, 0..100 côté UI. */}
      {businessModel === 'hybrid' && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t('programme.level_setup_rate', '% Setup (sur le montant setup one-shot)')}</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            placeholder={t('programme.level_setup_rate_placeholder', 'ex: 10 (laisser vide = pas de setup pour ce tier)')}
            style={inputStyle}
            value={form.setup_rate}
            onChange={e => setForm(f => ({ ...f, setup_rate: e.target.value }))}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.save')}</button>
        <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.cancel')}</button>
      </div>
    </div>
  );

  return (
    <div>
      <ConfirmModal
        isOpen={!!confirmAction}
        title={confirmAction?.kind === 'reset' ? t('programme.reset_confirm') : t('programme.delete_confirm')}
        message={confirmAction?.kind === 'reset' ? t('programme.reset_confirm') : t('programme.delete_confirm')}
        confirmLabel={confirmAction?.kind === 'reset' ? t('programme.reset') || 'Reset' : t('common.delete')}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant="danger"
        onConfirm={runConfirm}
        onCancel={() => setConfirmAction(null)}
      />
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('programme.title_full')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('programme.subtitle_full')}</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      {/* Threshold type */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 10 }}>{t('programme.crit_title')}</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setType('deals')} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (isDeal ? 'var(--rb-primary, #059669)' : '#e2e8f0'),
            background: isDeal ? '#f0fdf4' : '#fff', color: isDeal ? '#0f172a' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>{t('programme.crit_deals')}</button>
          <button onClick={() => setType('volume')} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (!isDeal ? 'var(--rb-primary, #059669)' : '#e2e8f0'),
            background: !isDeal ? '#f0fdf4' : '#fff', color: !isDeal ? '#0f172a' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>{t('programme.crit_volume')}</button>
        </div>
      </div>

      {/* Levels list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {data.levels.map(l => editing === l.id ? (
          <div key={l.id}>{formBlock}</div>
        ) : (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: (l.color || '#94a3b8') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{l.icon || '⭐'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: l.color || '#0f172a', fontSize: 15 }}>{l.name}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>{t('programme.level_desc', { min: parseFloat(l.min_threshold), unit: unitLabel, rate: parseFloat(l.commission_rate) })}</div>
              {recurringBilling && businessModel !== 'forfait_tjm' && (
                <div style={{ color: '#6366f1', fontSize: 11, marginTop: 2, fontWeight: 600 }}>
                  {l.longevity_mode === 'lifetime'
                    ? t('programme.longevity_lifetime_label', 'Longévité : à vie')
                    : t('programme.longevity_limited_label', { months: (l.longevity_months != null ? l.longevity_months : 12), defaultValue: 'Longévité : limité {{months}} mois' })}
                </div>
              )}
              {businessModel === 'hybrid' && l.setup_rate != null && (
                <div style={{ color: '#7c3aed', fontSize: 11, marginTop: 2, fontWeight: 600 }}>
                  {t('programme.level_setup_rate_label', { rate: parseFloat(l.setup_rate), defaultValue: 'Setup : {{rate}} % one-shot' })}
                </div>
              )}
            </div>
            <button onClick={() => startEdit(l)} title={t('common.edit')} style={{ padding: 8, borderRadius: 8, border: 'none', background: '#eef2ff', cursor: 'pointer', display: 'flex' }}><Edit2 size={14} color="#6366f1" /></button>
            <button onClick={() => del(l.id)} title={t('common.delete')} style={{ padding: 8, borderRadius: 8, border: 'none', background: '#fef2f2', cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
          </div>
        ))}
        {editing === 'new' && formBlock}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={startNew} disabled={editing !== null} style={{
          padding: '10px 18px', borderRadius: 10, border: 'none',
          background: editing !== null ? '#e2e8f0' : 'var(--rb-primary, #059669)',
          color: editing !== null ? '#94a3b8' : '#fff',
          fontWeight: 600, fontSize: 13, cursor: editing !== null ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}><Plus size={14} /> {t('programme.add_level')}</button>
        <button onClick={reset} style={{
          padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>{t('programme.reset_defaults')}</button>
      </div>
    </div>
  );
}

