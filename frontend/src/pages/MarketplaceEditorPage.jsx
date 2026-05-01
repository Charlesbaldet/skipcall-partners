import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Save, Languages, ExternalLink, GripVertical } from 'lucide-react';
import api from '../lib/api';
import { showToast } from '../components/Dialogs.jsx';
import { BLOCK_COMPONENTS } from './marketplaceBlocks/MarketplaceEditorBlocks.jsx';

// WYSIWYG editor for /marketplace/:slug. Top bar + ordered blocks read
// from page.page_blocks. Visible blocks render in order; hidden blocks
// (those not in page_blocks) render at the bottom with 50% opacity and
// a "Masqué" overlay so the admin can re-enable them.
//
// Drag-and-drop reorder uses native HTML5 drag events. Only the drag
// handle in each block's hover toolbar arms the wrapper for dragging
// (mousedown on the handle flips a state flag); this prevents a click
// inside contenteditable from accidentally starting a block drag.

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#fafbfc', border: '#e2e8f0' };

function StatusBadge({ visible, t }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
      background: visible ? '#f0fdf4' : '#f1f5f9',
      color: visible ? '#059669' : '#64748b',
    }}>{visible ? t('marketplace.editor.published', 'Publié') : t('marketplace.editor.draft', 'Brouillon')}</span>
  );
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        width: 44, height: 24, borderRadius: 999,
        background: value ? C.p : '#cbd5e1',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background .15s',
        flexShrink: 0,
      }}
      aria-pressed={value}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 22 : 2,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

const DEFAULT_BLOCKS = ['hero', 'tiers', 'conditions', 'about', 'ideal_client', 'why_join', 'references', 'additional_info', 'cta'];

// Block-level toolbar (drag handle + visibility toggle) shown on hover.
function BlockToolbar({ id, visible, dragArmed, onArmDrag, onDisarmDrag, onToggle, t }) {
  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, zIndex: 5,
      display: 'flex', gap: 6,
      background: '#fff', border: `1px solid ${C.border}`,
      borderRadius: 999, padding: 4,
      opacity: 0, transition: 'opacity .15s',
      pointerEvents: 'auto',
    }} className="rb-block-toolbar">
      {visible && (
        <button
          title="Glisser pour réorganiser"
          onMouseDown={() => onArmDrag(id)}
          onMouseUp={onDisarmDrag}
          style={{
            background: dragArmed ? '#ecfdf5' : 'transparent', border: 'none',
            color: C.s, padding: 6, borderRadius: 999, cursor: 'grab',
            display: 'flex',
          }}
        >
          <GripVertical size={14} />
        </button>
      )}
      <button
        title={visible ? 'Masquer' : 'Afficher'}
        onClick={() => onToggle(id)}
        style={{
          background: 'transparent', border: 'none', color: C.s,
          padding: 6, borderRadius: 999, cursor: 'pointer',
          display: 'flex',
        }}
      >
        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
    </div>
  );
}

export default function MarketplaceEditorPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [page, setPage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [translateRunning, setTranslateRunning] = useState(false);

  const dirtyRef = useRef(null);
  const debounceRef = useRef(null);

  // Drag-and-drop state.
  const [dragArmed, setDragArmed] = useState(null); // block id armed for drag (mousedown on handle)
  const [dragging, setDragging] = useState(null);   // block id currently dragging
  const [overId, setOverId] = useState(null);       // block id currently hovered

  useEffect(() => {
    api.getMarketplacePage()
      .then(d => { setTenant(d.tenant); setPage(d.page); })
      .catch(err => showToast(err.message || 'Erreur', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const flush = async () => {
    if (!dirtyRef.current) return;
    const payload = dirtyRef.current;
    dirtyRef.current = null;
    setSaving(true);
    try {
      const r = await api.updateMarketplacePage(payload);
      setTenant(r.tenant); setPage(r.page);
      showToast(t('marketplace.editor.saved', 'Sauvegardé') + ' ✓', 'success', 1800);
    } catch (err) {
      showToast(err.message || 'Erreur sauvegarde', 'error');
      dirtyRef.current = { ...payload, ...(dirtyRef.current || {}) };
    }
    setSaving(false);
  };

  const onPatch = (patch) => {
    if (patch.short_description !== undefined || patch.sector !== undefined ||
        patch.website !== undefined || patch.icp !== undefined ||
        patch.marketplace_visible !== undefined) {
      setTenant(prev => prev ? { ...prev, ...patch } : prev);
    }
    const pageKeys = ['page_headline', 'page_description', 'ideal_client', 'ideal_client_tags',
      'why_join', 'commission_blocks', 'client_references', 'additional_info', 'page_blocks'];
    if (pageKeys.some(k => patch[k] !== undefined)) {
      setPage(prev => prev ? { ...prev, ...patch } : prev);
    }
    dirtyRef.current = { ...(dirtyRef.current || {}), ...patch };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, 2000);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (dirtyRef.current) flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTranslate = async () => {
    try {
      setTranslateRunning(true);
      await api.translateMarketplacePage();
      showToast(t('marketplace.editor.translate_started', 'Traduction lancée. Cela prend environ 6 minutes en arrière-plan.'), 'info', 6000);
    } catch (err) {
      const code = err?.data?.error;
      if (code === 'anthropic_key_missing') showToast('ANTHROPIC_API_KEY manquant côté serveur', 'error');
      else if (code === 'already_running') showToast(t('marketplace.editor.translate_running', 'Traduction déjà en cours'), 'info');
      else showToast(err.message || 'Erreur', 'error');
    }
    setTranslateRunning(false);
  };

  const openPreview = () => {
    if (!tenant?.slug) return;
    window.open('/marketplace/' + tenant.slug, '_blank', 'noopener');
  };

  // Visibility helpers.
  const visibleBlocks = Array.isArray(page?.page_blocks) && page.page_blocks.length
    ? page.page_blocks
    : DEFAULT_BLOCKS;
  const visibleSet = new Set(visibleBlocks);
  const hiddenBlocks = DEFAULT_BLOCKS.filter(id => !visibleSet.has(id));

  const toggleVisibility = (id) => {
    if (visibleSet.has(id)) {
      // Remove from page_blocks (block becomes hidden).
      const next = visibleBlocks.filter(x => x !== id);
      onPatch({ page_blocks: next });
    } else {
      // Add at the end of visible blocks.
      const next = [...visibleBlocks, id];
      onPatch({ page_blocks: next });
    }
  };

  // Reorder commits via the dedicated endpoint so block order stays a
  // single atomic operation (and so a partial PUT after a long edit
  // doesn't fight with the order).
  const commitReorder = async (nextOrder) => {
    setPage(prev => prev ? { ...prev, page_blocks: nextOrder } : prev);
    try {
      await api.reorderMarketplaceBlocks(nextOrder);
    } catch (err) {
      showToast(err.message || 'Erreur réorganisation', 'error');
    }
  };

  const onDragStart = (e, id) => {
    setDragging(id);
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); } catch {}
  };
  const onDragOver = (e, id) => {
    if (!dragging || dragging === id || !visibleSet.has(id)) return;
    e.preventDefault();
    setOverId(id);
  };
  const onDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragging || dragging === targetId) { setDragging(null); setOverId(null); return; }
    const order = [...visibleBlocks];
    const fromIdx = order.indexOf(dragging);
    const toIdx = order.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragging(null); setOverId(null); return; }
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragging);
    setDragging(null); setOverId(null); setDragArmed(null);
    commitReorder(order);
  };
  const onDragEnd = () => { setDragging(null); setOverId(null); setDragArmed(null); };

  if (loading) return <div style={{ padding: 32, color: C.m, fontSize: 14 }}>Chargement…</div>;
  if (!tenant) return <div style={{ padding: 32, color: C.m, fontSize: 14 }}>Tenant introuvable.</div>;

  const blockProps = { tenant, page, onPatch, t };
  const renderBlock = (id, isVisible) => {
    const Block = BLOCK_COMPONENTS[id];
    if (!Block) return null;
    const isOver = overId === id && dragging && dragging !== id;
    return (
      <div
        key={id}
        draggable={dragArmed === id && isVisible}
        onDragStart={e => onDragStart(e, id)}
        onDragOver={e => isVisible && onDragOver(e, id)}
        onDrop={e => isVisible && onDrop(e, id)}
        onDragEnd={onDragEnd}
        style={{
          position: 'relative',
          opacity: isVisible ? (dragging === id ? 0.4 : 1) : 0.5,
          transition: 'opacity .15s, transform .15s',
          // Visual nudge: shift the hovered drop target down a bit.
          transform: isOver ? 'translateY(4px)' : 'none',
        }}
        onMouseEnter={e => {
          const tb = e.currentTarget.querySelector('.rb-block-toolbar');
          if (tb) tb.style.opacity = '1';
        }}
        onMouseLeave={e => {
          const tb = e.currentTarget.querySelector('.rb-block-toolbar');
          if (tb) tb.style.opacity = '0';
        }}
      >
        <BlockToolbar
          id={id}
          visible={isVisible}
          dragArmed={dragArmed === id}
          onArmDrag={setDragArmed}
          onDisarmDrag={() => setDragArmed(null)}
          onToggle={toggleVisibility}
          t={t}
        />
        {!isVisible && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 4,
            background: 'rgba(248,250,252,0.5)',
            borderRadius: 20,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: 16, pointerEvents: 'none',
          }}>
            <span style={{
              padding: '4px 12px', borderRadius: 999,
              background: '#fff', border: `1px solid ${C.border}`,
              color: C.m, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
            }}>
              {t('marketplace.editor.hidden', 'Masqué')}
            </span>
          </div>
        )}
        <Block {...blockProps} />
      </div>
    );
  };

  return (
    <div style={{ background: C.bg, minHeight: 'calc(100vh - 80px)', paddingBottom: 64 }}>
      {/* Sticky top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#fff', borderBottom: `1px solid ${C.border}`,
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ color: C.m, fontSize: 13 }}>Marketplace /</span>
          <span style={{ color: C.s, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tenant.company_name}
          </span>
          <StatusBadge visible={!!tenant.marketplace_visible} t={t} />
          {saving && <span style={{ color: C.m, fontSize: 12 }}>Enregistrement…</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.s, cursor: 'pointer' }}>
            <Toggle value={!!tenant.marketplace_visible} onChange={v => onPatch({ marketplace_visible: v })} />
            <span style={{ fontWeight: 600 }}>{t('marketplace.editor.publish_toggle', 'Publier sur la marketplace')}</span>
          </label>
          <button
            onClick={openPreview}
            disabled={!tenant.slug}
            style={{
              padding: '8px 14px', borderRadius: 10,
              background: '#fff', border: `1px solid ${C.border}`, color: C.s,
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Eye size={14} /> {t('marketplace.editor.preview', 'Prévisualiser')}
            <ExternalLink size={12} />
          </button>
          <button
            onClick={flush}
            disabled={saving}
            style={{
              padding: '8px 14px', borderRadius: 10,
              background: C.p, border: 'none', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Save size={14} /> {t('marketplace.editor.save', 'Sauvegarder')}
          </button>
          <button
            onClick={handleTranslate}
            disabled={translateRunning}
            style={{
              padding: '8px 14px', borderRadius: 10,
              background: '#fff', border: `1px solid ${C.border}`, color: C.s,
              fontWeight: 600, fontSize: 13, cursor: translateRunning ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: translateRunning ? 0.7 : 1,
            }}
          >
            <Languages size={14} /> {t('marketplace.editor.translate', 'Traduire automatiquement')}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Visible blocks in their saved order */}
        {visibleBlocks.map(id => renderBlock(id, true))}
        {/* Hidden blocks at the bottom (default order) */}
        {hiddenBlocks.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${C.border}` }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: C.m, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
              {t('marketplace.editor.hidden_blocks', 'Blocs masqués')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {hiddenBlocks.map(id => renderBlock(id, false))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
