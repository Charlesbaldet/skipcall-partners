import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Lock, GripVertical } from 'lucide-react';
import api from '../lib/api';
import ConfirmModal from './ConfirmModal.jsx';

// Drag-and-drop list of tenant pipeline columns. Won/Lost stages are
// locked (no delete, position stays on the last two rows server-side).
const PRESET_COLORS = [
  '#6B7280', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444',
  '#EC4899', '#14B8A6', '#F97316', '#0EA5E9',
];

export default function PipelineStagesEditor() {
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
      setMsg({ type: 'success', text: t('crm.saved') || 'Saved' });
      setTimeout(() => setMsg(null), 1500);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [t]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.createPipelineStage({ name: newName.trim(), color: newColor });
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

      {/* Info banner for won */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 12, color: '#047857', marginBottom: 16, lineHeight: 1.5 }}>
        <span style={{ fontSize: 14 }}>💰</span>
        <span>{t('pipeline.won_stage_info')}</span>
      </div>

      {/* Add new stage */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setColorOpenFor(colorOpenFor === '__new__' ? null : '__new__')}
            style={{ width: 20, height: 20, borderRadius: '50%', background: newColor, border: '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0', cursor: 'pointer' }}
          />
          {colorOpenFor === '__new__' && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 28, left: 0, zIndex: 10, background: '#fff', borderRadius: 10, padding: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, width: 140 }}>
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
        </div>
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
