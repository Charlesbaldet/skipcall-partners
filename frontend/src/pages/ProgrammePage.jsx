import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
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
  const [form, setForm] = useState({ name: '', icon: '⭐', color: '#94a3b8', min_threshold: 0, commission_rate: 10 });
  // { kind: 'delete'|'reset', id? }
  const [confirmAction, setConfirmAction] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getTenantLevels();
      setData({ levels: d.levels || [], threshold_type: d.threshold_type || 'deals' });
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
    });
    setEditing(l.id);
  };

  const startNew = () => {
    setForm({ name: '', icon: '⭐', color: '#94a3b8', min_threshold: 0, commission_rate: 10 });
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

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('programme.loading')}</div>;

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
        confirmLabel={confirmAction?.kind === 'reset' ? t('programme.reset') || 'Reset' : t('news.delete') || 'Supprimer'}
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

      {/* ─── Pipeline stages editor ─── */}
      <div style={{ height: 1, background: '#e2e8f0', margin: '40px 0' }}/>
      <PipelineStagesEditor />
    </div>
  );
}

// ═══ Pipeline stages editor ═══
// Drag-and-drop list of tenant pipeline columns. Won/Lost stages are
// locked (no delete, no drag out of last two positions).
const PRESET_COLORS = [
  '#6B7280', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444',
  '#EC4899', '#14B8A6', '#F97316', '#0EA5E9',
];

function PipelineStagesEditor() {
  const { t } = useTranslation();
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [colorOpenFor, setColorOpenFor] = useState(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [draggedId, setDraggedId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const d = await api.getPipelineStages(); setStages(d.stages || []); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const dirtyRef = useCallback(async (stage, patch) => {
    try {
      await api.updatePipelineStage(stage.id, patch);
      setStages(prev => prev.map(s => s.id === stage.id ? { ...s, ...patch } : s));
      setMsg({ type: 'success', text: t('programme.saved') || t('crm.saved') });
      setTimeout(() => setMsg(null), 1500);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [t]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { stage } = await api.createPipelineStage({ name: newName.trim(), color: newColor });
      setStages(prev => {
        // The backend inserts before the system stages; easiest to
        // just refetch to get authoritative positions.
        return [...prev];
      });
      setNewName(''); setNewColor('#3B82F6');
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.deletePipelineStage(deleteId);
      setDeleteId(null);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error === 'system_stage_locked' ? t('pipeline.system_stage_warning') : e.message });
      setDeleteId(null);
    }
  };

  const handleDrop = async (targetIdx) => {
    if (!draggedId) return;
    const src = stages.findIndex(s => s.id === draggedId);
    if (src === -1 || src === targetIdx) { setDraggedId(null); return; }
    // Reorder optimistically; backend snaps system stages to last two.
    const reordered = [...stages];
    const [moved] = reordered.splice(src, 1);
    reordered.splice(targetIdx, 0, moved);
    setStages(reordered);
    setDraggedId(null);
    try {
      const { stages: fresh } = await api.reorderPipelineStages(reordered.map((s, i) => ({ id: s.id, position: i })));
      setStages(fresh);
    } catch (e) { setMsg({ type: 'error', text: e.message }); load(); }
  };

  if (loading) return <div style={{ color: '#94a3b8', padding: 12 }}>{t('settings.loading')}</div>;

  return (
    <div>
      <ConfirmModal
        isOpen={!!deleteId}
        title={t('pipeline.delete_stage')}
        message={t('pipeline.confirm_delete')}
        confirmLabel={t('news.delete') || 'Supprimer'}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
        {t('pipeline.stages')}
      </h3>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 18, lineHeight: 1.55 }}>
        {t('pipeline.stages_desc')}
      </p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {stages.map((s, idx) => (
          <div
            key={s.id}
            draggable={!s.is_system}
            onDragStart={() => setDraggedId(s.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(idx)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
              opacity: draggedId === s.id ? 0.5 : 1,
              cursor: s.is_system ? 'default' : 'grab',
            }}
          >
            {!s.is_system && <GripVertical size={14} color="#cbd5e1"/>}
            {s.is_system && <Lock size={12} color="#94a3b8" title={t('pipeline.system_stage_warning')}/>}
            {/* Color dot + picker */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setColorOpenFor(colorOpenFor === s.id ? null : s.id); }}
                style={{ width: 20, height: 20, borderRadius: '50%', background: s.color, border: '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0', cursor: 'pointer' }}
                aria-label={t('pipeline.color')}
              />
              {colorOpenFor === s.id && (
                <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 28, left: 0, zIndex: 10, background: '#fff', borderRadius: 10, padding: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, width: 140 }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); dirtyRef(s, { color: c }); setColorOpenFor(null); }}
                      style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: s.color === c ? '2px solid #0f172a' : '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0', cursor: 'pointer' }}
                    />
                  ))}
                </div>
              )}
            </div>
            <input
              defaultValue={s.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) dirtyRef(s, { name: v }); }}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, fontWeight: 600, color: '#0f172a', background: 'transparent', fontFamily: 'inherit' }}
            />
            {s.is_won && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f0fdf4', color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5 }} title={t('pipeline.won_stage_info')}>
                WON
              </span>
            )}
            {s.is_lost && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fef2f2', color: '#dc2626', textTransform: 'uppercase', letterSpacing: 0.5 }} title={t('pipeline.lost_stage_info')}>
                LOST
              </span>
            )}
            {s.is_system ? (
              <Lock size={14} color="#94a3b8"/>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteId(s.id)}
                title={t('pipeline.delete_stage')}
                style={{ padding: 6, borderRadius: 6, border: 'none', background: '#fef2f2', cursor: 'pointer', display: 'flex' }}
              >
                <Trash2 size={13} color="#dc2626"/>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Info banner for won/lost */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 12, color: '#047857', marginBottom: 16, lineHeight: 1.5 }}>
        <span style={{ fontSize: 14 }}>💰</span>
        <span>{t('pipeline.won_stage_info')}</span>
      </div>

      {/* Add new stage */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
        <button
          type="button"
          onClick={() => setColorOpenFor(colorOpenFor === '__new__' ? null : '__new__')}
          style={{ width: 20, height: 20, borderRadius: '50%', background: newColor, border: '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0', cursor: 'pointer', position: 'relative' }}
        />
        {colorOpenFor === '__new__' && (
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', zIndex: 10, marginTop: 80, background: '#fff', borderRadius: 10, padding: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, width: 140 }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={(e) => { e.stopPropagation(); setNewColor(c); setColorOpenFor(null); }}
                style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: newColor === c ? '2px solid #0f172a' : '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0', cursor: 'pointer' }}
              />
            ))}
          </div>
        )}
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={t('pipeline.stage_name_ph')}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !newName.trim()}
          style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: newName.trim() ? 'var(--rb-primary, #059669)' : '#e2e8f0', color: newName.trim() ? '#fff' : '#94a3b8', fontWeight: 600, fontSize: 12, cursor: newName.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14}/> {t('pipeline.add_stage')}
        </button>
      </div>
    </div>
  );
}
