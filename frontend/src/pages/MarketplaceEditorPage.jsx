import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Save, Languages, ExternalLink, GripVertical, Tag, Users, ArrowRight, Upload, Pencil, X as XIcon } from 'lucide-react';
import api from '../lib/api';
import { showToast, showConfirm } from '../components/Dialogs.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';
import { BLOCK_COMPONENTS } from './marketplaceBlocks/MarketplaceEditorBlocks.jsx';

// Sector list mirrors the public /marketplace filter so admins can
// only pick a value the listing already filters by.
const SECTORS = [
  'SaaS / Logiciel', 'Conseil & Services', 'Finance & Fintech', 'RH & Recrutement',
  'Marketing & Communication', 'Immobilier', 'Commerce', 'Formation',
  'Juridique', 'Comptabilité', 'Industrie', 'Autre',
];

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

// ── Marketplace card preview ─────────────────────────────────────────
// Pinned to the top of the editor (above the reorderable page blocks)
// because the listing card is the gatekeeper to the detail page —
// admins should be able to tweak it without scrolling. Visual is a
// pixel-mirror of <PartnerCard> in MarketplacePage.jsx so the preview
// matches what /marketplace will actually render.
function CardPreview({ tenant, t }) {
  const initials = (tenant.company_name || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const color = tenant.primary_color || C.p;
  return (
    <article style={{
      background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,.06)',
      display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden',
      width: 320, margin: '0 auto',
    }}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          {tenant.logo_url
            ? <img src={tenant.logo_url} alt={tenant.company_name} style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'contain', border: '1px solid #f1f5f9' }} />
            : <div style={{ width: 48, height: 48, borderRadius: 12, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color }}>{initials}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: C.s, display: 'block' }}>
              {tenant.company_name || t('marketplace.editor.preview_no_name', 'Nom de l\'entreprise')}
            </span>
            {tenant.sector && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color, background: color + '15', borderRadius: 20, padding: '2px 10px', marginTop: 4 }}>
                <Tag size={10} /> {tenant.sector}
              </span>
            )}
          </div>
        </div>
        <p style={{ fontSize: 14, color: C.m, lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {tenant.short_description || t('marketplace.editor.preview_no_desc', 'Description courte de votre programme — apparaît sur la liste des programmes.')}
        </p>
        {tenant.icp && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.m, background: '#f8fafc', borderRadius: 8, padding: '6px 10px', marginTop: 12 }}>
            <Users size={12} color={C.p} />
            <span><strong style={{ color: C.s }}>{t('marketplace.target', 'Cible :')}</strong> {tenant.icp}</span>
          </div>
        )}
      </div>
      <div style={{ padding: '0 24px 24px', marginTop: 'auto' }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '12px 14px', borderRadius: 10,
          background: 'linear-gradient(135deg,' + C.p + ',#10b981)',
          color: '#fff', fontWeight: 600, fontSize: 13,
        }}>
          {t('marketplace.learn_more', 'En savoir plus')} <ArrowRight size={14} />
        </span>
      </div>
    </article>
  );
}

// Form field — label + input + optional helper. Kept inline so the
// card preview block stays self-contained.
function Field({ label, children, full = false }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: full ? '1 / -1' : 'auto' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.s, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${C.border}`,
  fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff',
};
const inputStyleLocked = {
  ...inputStyle,
  background: '#f8fafc', color: '#64748b', cursor: 'not-allowed',
};

function CardEditor({ tenant, onPatch, t, editable = true }) {
  // When the editor is in read mode, every form field switches to a
  // gray "disabled" look mirroring the contenteditable lockdown on
  // the Page tab. The visual is the same form so the admin sees what
  // they have, but they can't change anything until they hit Éditer.
  const fieldStyle = editable ? inputStyle : inputStyleLocked;
  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast(t('marketplace.editor.choose_image', 'Choisissez une image'), 'error');
    if (file.size > 500 * 1024) return showToast(t('marketplace.editor.logo_too_large_500', 'Logo trop volumineux (500 KB max)'), 'error');
    const reader = new FileReader();
    reader.onload = (ev) => onPatch({ logo_url: ev.target.result });
    reader.onerror = () => showToast(t('marketplace.editor.file_read_failed', 'Lecture du fichier échouée'), 'error');
    reader.readAsDataURL(file);
  };
  return (
    <section style={{
      background: '#fff', padding: '32px 32px 36px', borderRadius: 20,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
          {t('marketplace.editor.card_label', 'Aperçu carte marketplace')}
        </p>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.s }}>
          {t('marketplace.editor.card_title', 'Comment votre programme apparaît sur /marketplace')}
        </h2>
      </div>

      <div style={{ marginBottom: 28 }}>
        <CardPreview tenant={tenant} t={t} />
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14,
        maxWidth: 880, margin: '0 auto',
      }}>
        <Field label={t('marketplace.editor.field_name', 'Nom de l\'entreprise')}>
          <input
            value={tenant.company_name || ''}
            onChange={e => onPatch({ company_name: e.target.value })}
            placeholder="Acme Corp"
            style={fieldStyle}
            disabled={!editable}
          />
        </Field>
        <Field label={t('marketplace.editor.field_sector', 'Secteur')}>
          <select
            value={tenant.sector || ''}
            onChange={e => onPatch({ sector: e.target.value })}
            style={{ ...fieldStyle, cursor: editable ? 'pointer' : 'not-allowed' }}
            disabled={!editable}
          >
            <option value="">{t('marketplace.editor.field_sector_ph', '— Choisir un secteur —')}</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label={t('marketplace.editor.field_short_desc', 'Description courte (carte)')} full>
          <textarea
            value={tenant.short_description || ''}
            onChange={e => onPatch({ short_description: e.target.value })}
            rows={2}
            placeholder={t('marketplace.editor.field_short_desc_ph', 'Une phrase qui résume votre programme. Visible sur la liste.')}
            style={{ ...fieldStyle, resize: editable ? 'vertical' : 'none', minHeight: 60 }}
            maxLength={240}
            disabled={!editable}
          />
        </Field>
        <Field label={t('marketplace.editor.field_icp', 'Cible (ICP)')}>
          <input
            value={tenant.icp || ''}
            onChange={e => onPatch({ icp: e.target.value })}
            placeholder={t('marketplace.editor.field_icp_ph', 'PME, indépendants, retail…')}
            style={fieldStyle}
            disabled={!editable}
          />
        </Field>
        <Field label={t('marketplace.editor.field_website', 'Site web')}>
          <input
            type="url"
            value={tenant.website || ''}
            onChange={e => onPatch({ website: e.target.value })}
            placeholder="https://example.com"
            style={fieldStyle}
            disabled={!editable}
          />
        </Field>
        <Field label={t('marketplace.editor.field_logo', 'Logo')} full>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12, background: C.bg,
              border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 6, overflow: 'hidden', flexShrink: 0,
            }}>
              {tenant.logo_url
                ? <img src={tenant.logo_url} alt={tenant.company_name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <span style={{ color: C.m, fontSize: 11 }}>—</span>}
            </div>
            {/* Upload + Retirer only show in edit mode. The preview tile
                above stays so the admin can still see what's saved. */}
            {editable && (
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 10,
                background: C.bg, border: `1.5px solid ${C.border}`,
                color: C.s, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>
                <Upload size={14} />
                {t('marketplace.editor.field_logo_upload', 'Téléverser un logo (PNG/JPG, 500 KB max)')}
                <input type="file" accept="image/*" onChange={handleLogoFile} style={{ display: 'none' }} />
              </label>
            )}
            {editable && tenant.logo_url && (
              <button
                onClick={() => onPatch({ logo_url: null })}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: 'transparent', border: 'none',
                  color: C.m, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('marketplace.editor.field_logo_remove', 'Retirer')}
              </button>
            )}
          </div>
        </Field>
      </div>
    </section>
  );
}

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

  // ── New layout state ────────────────────────────────────────────────
  // editMode: false = read-only preview; true = action bar visible +
  //   block edit controls (drag/visibility/delete) shown.
  // activeSubTab: 'card' | 'page' — switches body content. Tab swaps
  //   are NOT navigation; they don't trigger the unsaved-changes guard.
  // hasUnsavedChanges: mirrors dirtyRef in React state so the orange
  //   "•" indicator + the navigation guard can react to it.
  const [editMode, setEditMode] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('card');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const navigate = useNavigate();

  // Drag-and-drop state.
  const [dragArmed, setDragArmed] = useState(null); // block id armed for drag (mousedown on handle)
  const [dragging, setDragging] = useState(null);   // block id currently dragging
  const [overId, setOverId] = useState(null);       // block id currently hovered

  useEffect(() => {
    api.getMarketplacePage()
      .then(d => {
        // Backend returns { tenant, page } at the top level, but the
        // endpoint has been observed returning the body via
        // `response.data.tenant` after some upstream rewrites the
        // payload. Accept both shapes so a future change can't drop
        // the editor into the "Tenant introuvable" fallback again.
        const payload = (d && d.tenant) ? d : (d && d.data) || d || {};
        const tenantValue = payload.tenant ?? null;
        const pageValue   = payload.page   ?? null;
        if (!tenantValue) {
          // We got a 200 but no tenant key — log what we did get so
          // future debugging doesn't have to go through the network
          // tab to learn the response shape.
          console.error('[MarketplaceEditor] response missing `tenant`', d);
        }
        setTenant(tenantValue);
        setPage(pageValue);
      })
      .catch(err => showToast(err.message || t('common.error', 'Erreur'), 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Internal: PUT the accumulated diff. Returns true if a request
  // actually went out, false if nothing was dirty. Silent on the
  // empty-diff path because the debounce calls this every 2s and we
  // don't want to spam toasts when nothing changed.
  const flush = async () => {
    if (!dirtyRef.current) return false;
    const payload = dirtyRef.current;
    dirtyRef.current = null;
    setSaving(true);
    try {
      const r = await api.updateMarketplacePage(payload);
      setTenant(r.tenant); setPage(r.page);
      // Clear dirty: the round-trip succeeded and dirtyRef.current was
      // already nulled at the top, so unless onPatch fired again
      // mid-flight there's nothing pending.
      if (!dirtyRef.current) setHasUnsavedChanges(false);
      showToast(t('marketplace.editor.saved', 'Sauvegardé') + ' ✓', 'success', 1800);
      return true;
    } catch (err) {
      showToast(err.message || t('marketplace.editor.error_save', 'Erreur sauvegarde'), 'error');
      dirtyRef.current = { ...payload, ...(dirtyRef.current || {}) };
      setHasUnsavedChanges(true);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Explicit Save-button handler. Two fixes vs the old direct
  // onClick={flush}:
  //  1. Blur the active element first so an in-progress
  //     contenteditable edit (which commits via onBlur → onPatch)
  //     populates dirtyRef BEFORE we check it. Without this, a
  //     click on Save while still typing would race the blur and
  //     skip the field's latest value.
  //  2. Always show feedback. The 2s debounce often saved
  //     already, leaving dirtyRef empty by the time the user
  //     clicks the button — the old code returned silently and
  //     looked like the button was broken.
  const handleSaveClick = async () => {
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (ae && typeof ae.blur === 'function') ae.blur();
    // One frame for blur → onChange → onPatch → setState/dirtyRef.
    await new Promise(r => setTimeout(r, 50));
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const sentRequest = await flush();
    if (!sentRequest) {
      // Nothing was dirty — debounce already flushed everything.
      // Still confirm to the user that their state is saved.
      showToast(t('marketplace.editor.saved', 'Sauvegardé') + ' ✓', 'success', 1500);
    }
  };

  const onPatch = (patch) => {
    const tenantKeys = ['short_description', 'sector', 'website', 'icp', 'marketplace_visible', 'company_name', 'logo_url'];
    if (tenantKeys.some(k => patch[k] !== undefined)) {
      setTenant(prev => prev ? { ...prev, ...patch } : prev);
    }
    const pageKeys = ['page_headline', 'page_description', 'ideal_client', 'ideal_client_tags',
      'why_join', 'commission_blocks', 'client_references', 'additional_info', 'page_blocks'];
    if (pageKeys.some(k => patch[k] !== undefined)) {
      setPage(prev => prev ? { ...prev, ...patch } : prev);
    }
    dirtyRef.current = { ...(dirtyRef.current || {}), ...patch };
    setHasUnsavedChanges(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, 2000);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (dirtyRef.current) flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Unsaved-changes guard ──────────────────────────────────────────
  // Browser refresh / tab close. The HTML spec requires assigning
  // returnValue (Chrome) AND calling preventDefault (Firefox/Safari).
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // In-app navigation (sidebar links, breadcrumb, anywhere using <a>
  // or <Link>). The app uses <BrowserRouter>, not the data router, so
  // useBlocker is a no-op — we intercept link clicks at the document
  // level instead. Capture phase fires before React Router's own
  // onClick, so preventDefault here actually cancels the SPA navigate.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e) => {
      // Modifier-clicks (cmd / ctrl / middle-click) open in a new
      // tab — current tab keeps its dirty state, no warning needed.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== undefined && e.button !== 0) return;
      const a = e.target.closest && e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href) return;
      // External / hash / mailto / new-tab links — let the browser do
      // its thing, the dirty editor stays mounted.
      if (/^(https?:|mailto:|tel:|#)/.test(href)) return;
      if (a.target === '_blank') return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      showConfirm({
        title: t('marketplace.editor.unsaved_title', 'Modifications non sauvegardées'),
        message: t('marketplace.editor.unsaved_message', 'Vous avez des modifications non sauvegardées. Voulez-vous quitter sans sauvegarder ?'),
        confirmLabel: t('marketplace.editor.leave', 'Quitter sans sauvegarder'),
        cancelLabel: t('marketplace.editor.stay', 'Rester sur la page'),
        variant: 'warning',
      }).then(ok => {
        if (ok) {
          // Drop the dirty buffer — the user explicitly chose to
          // discard. If they cancel we stay put.
          dirtyRef.current = null;
          setHasUnsavedChanges(false);
          navigate(href);
        }
      });
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [hasUnsavedChanges, t, navigate]);

  const handleTranslate = async () => {
    try {
      setTranslateRunning(true);
      await api.translateMarketplacePage();
      showToast(t('marketplace.editor.translate_started', 'Traduction lancée. Cela prend environ 6 minutes en arrière-plan.'), 'info', 6000);
    } catch (err) {
      const code = err?.data?.error;
      if (code === 'anthropic_key_missing') showToast('ANTHROPIC_API_KEY manquant côté serveur', 'error');
      else if (code === 'already_running') showToast(t('marketplace.editor.translate_running', 'Traduction déjà en cours'), 'info');
      else showToast(err.message || t('common.error', 'Erreur'), 'error');
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
      showToast(err.message || t('marketplace.editor.error_reorder', 'Erreur réorganisation'), 'error');
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

  if (loading) return <PageSkeleton />;
  if (!tenant) return <div style={{ padding: 32, color: C.m, fontSize: 14 }}>{t('marketplace.editor.tenant_not_found', 'Tenant introuvable.')}</div>;

  const blockProps = { tenant, page, onPatch, t, editable: editMode };
  const renderBlock = (id, isVisible) => {
    const Block = BLOCK_COMPONENTS[id];
    if (!Block) return null;
    const isOver = overId === id && dragging && dragging !== id;
    return (
      <div
        key={id}
        draggable={editMode && dragArmed === id && isVisible}
        onDragStart={e => editMode && onDragStart(e, id)}
        onDragOver={e => editMode && isVisible && onDragOver(e, id)}
        onDrop={e => editMode && isVisible && onDrop(e, id)}
        onDragEnd={onDragEnd}
        style={{
          position: 'relative',
          opacity: isVisible ? (dragging === id ? 0.4 : 1) : 0.5,
          transition: 'opacity .15s, transform .15s',
          // Visual nudge: shift the hovered drop target down a bit.
          transform: isOver ? 'translateY(4px)' : 'none',
        }}
        onMouseEnter={e => {
          if (!editMode) return;
          const tb = e.currentTarget.querySelector('.rb-block-toolbar');
          if (tb) tb.style.opacity = '1';
        }}
        onMouseLeave={e => {
          if (!editMode) return;
          const tb = e.currentTarget.querySelector('.rb-block-toolbar');
          if (tb) tb.style.opacity = '0';
        }}
      >
        {editMode && (
          <BlockToolbar
            id={id}
            visible={isVisible}
            dragArmed={dragArmed === id}
            onArmDrag={setDragArmed}
            onDisarmDrag={() => setDragArmed(null)}
            onToggle={toggleVisibility}
            t={t}
          />
        )}
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

  // Toggling out of edit mode while there's a pending diff would leave
  // the user staring at a "Modifications non sauvegardées" indicator
  // they can no longer act on. Force a flush through the existing
  // save handler so the dirty buffer either lands or surfaces an
  // error before we collapse the action bar.
  const handleToggleEdit = async () => {
    if (editMode && hasUnsavedChanges) {
      const ok = await showConfirm({
        title: t('marketplace.editor.unsaved_title', 'Modifications non sauvegardées'),
        message: t('marketplace.editor.unsaved_close_message', 'Vous avez des modifications non sauvegardées. Fermer l\'éditeur sans sauvegarder ?'),
        confirmLabel: t('marketplace.editor.leave', 'Quitter sans sauvegarder'),
        cancelLabel: t('marketplace.editor.stay', 'Rester sur la page'),
        variant: 'warning',
      });
      if (!ok) return;
      // Discard the dirty buffer so we drop edits the user explicitly
      // chose not to keep.
      dirtyRef.current = null;
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      setHasUnsavedChanges(false);
    }
    setEditMode(prev => !prev);
  };

  return (
    <div style={{ background: C.bg, minHeight: 'calc(100vh - 80px)', paddingBottom: 64 }}>
      {/* Hover-reveal: delete / edit buttons inside a card stay
          invisible until the user hovers the card. Cheaper than
          tracking hover state per-card in React. */}
      <style>{`
        .rb-card-hover-parent:hover .rb-card-hover-only,
        .rb-card-hover-parent:focus-within .rb-card-hover-only { opacity: 1 !important; }
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder); color: rgba(100,116,139,0.6); pointer-events: none;
        }
      `}</style>
      {/* Sticky top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#fff', borderBottom: `1px solid ${C.border}`,
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexWrap: 'wrap' }}>
          {/* Standardised title block — 22/500 + 13 sub-title, matches
              Dashboard / Pipeline / Partenaires / Commissions. */}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: C.s, letterSpacing: -0.2 }}>
              {t('marketplace.editor.page_title', 'Marketplace')}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.m }}>
              {t('marketplace.editor.page_subtitle', 'Présentation de votre programme')}
            </p>
          </div>
          <StatusBadge visible={!!tenant.marketplace_visible} t={t} />
          {saving && <span style={{ color: C.m, fontSize: 12 }}>{t('marketplace.editor.saving', 'Enregistrement…')}</span>}
          {hasUnsavedChanges && !saving && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color: '#c2410c',
              background: '#fff7ed', border: '1px solid #fed7aa',
              padding: '3px 10px', borderRadius: 999,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316' }} />
              {t('marketplace.editor.unsaved_indicator', 'Modifications non sauvegardées')}
            </span>
          )}
        </div>
        {/* Top bar right side: Publier toggle only. The Éditer /
            Fermer l'éditeur button moved into the content area
            (rendered below as a floating top-right button) so
            switching between read and edit modes feels grounded
            on the content rather than tucked into the chrome. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.s, cursor: 'pointer' }}>
            <Toggle value={!!tenant.marketplace_visible} onChange={v => onPatch({ marketplace_visible: v })} />
            <span style={{ fontWeight: 600 }}>{t('marketplace.editor.publish_toggle', 'Publier sur la marketplace')}</span>
          </label>
        </div>
      </div>

      {/* Action bar — only when editing. Centred row of three actions
          on a light grey strip so the admin can find them without
          scrolling back up to the sticky top bar. */}
      {editMode && (
        <div style={{
          background: '#f9fafb', borderBottom: `1px solid ${C.border}`,
          padding: '10px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 0, flexWrap: 'wrap',
        }}>
          <button
            onClick={openPreview}
            disabled={!tenant.slug}
            style={{
              padding: '8px 16px', borderRadius: 10,
              background: '#fff', border: `1.5px solid ${C.border}`, color: C.s,
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Eye size={14} /> {t('marketplace.editor.preview', 'Prévisualiser')}
            <ExternalLink size={12} />
          </button>
          <span style={{ width: 1, height: 22, background: C.border, margin: '0 12px' }} aria-hidden="true" />
          <button
            onClick={handleSaveClick}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 10,
              background: C.p, border: 'none', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Save size={14} />
            {t('marketplace.editor.save', 'Sauvegarder')}
            {hasUnsavedChanges && (
              <span aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#f97316', boxShadow: '0 0 0 2px rgba(255,255,255,0.5)',
              }} />
            )}
          </button>
          <span style={{ width: 1, height: 22, background: C.border, margin: '0 12px' }} aria-hidden="true" />
          <button
            onClick={handleTranslate}
            disabled={translateRunning}
            style={{
              padding: '8px 16px', borderRadius: 10,
              background: '#2563eb', border: 'none', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: translateRunning ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: translateRunning ? 0.7 : 1,
            }}
          >
            <Languages size={14} /> {t('marketplace.editor.translate', 'Traduire automatiquement')}
          </button>
        </div>
      )}

      {/* Sub-tabs — purely local navigation, never trigger the
          unsaved-changes guard. Both tabs share the same { tenant,
          page } state, so swapping doesn't lose data. The tabs no
          longer sit inside a card; they float on the page background
          with a thin separator below. */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        gap: 4, paddingTop: 16,
      }}>
        {[
          { id: 'card', label: t('marketplace.editor.tab_card', 'Carte marketplace') },
          { id: 'page', label: t('marketplace.editor.tab_page', 'Page complète') },
        ].map(tab => {
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                padding: '10px 20px',
                background: 'transparent', border: 'none',
                borderBottom: '2px solid ' + (active ? C.p : 'transparent'),
                color: active ? C.p : C.m,
                fontSize: 14, fontWeight: active ? 600 : 500, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'color .15s, border-color .15s',
                marginBottom: -1, // overlap the separator below
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div style={{ borderBottom: `1px solid ${C.border}` }} />

      {/* Content area — position:relative so the floating Edit
          button (top-right) anchors here. */}
      <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <button
          onClick={handleToggleEdit}
          style={{
            position: 'absolute', top: 16, right: 24, zIndex: 10,
            padding: '6px 16px', borderRadius: 8,
            background: editMode ? '#fff' : C.p,
            border: editMode ? `1px solid ${C.border}` : 'none',
            color: editMode ? C.s : '#fff',
            fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            boxShadow: editMode ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          {editMode ? <XIcon size={13} /> : <Pencil size={13} />}
          {editMode
            ? t('marketplace.editor.close_editor', "Fermer l'éditeur")
            : t('marketplace.editor.edit_button', 'Éditer')}
        </button>

        {activeSubTab === 'card' ? (
          // editable={editMode} disables the form fields and hides the
          // logo upload affordance when the user is not in edit mode,
          // matching the contenteditable lockdown on the Page tab.
          <CardEditor tenant={tenant} onPatch={onPatch} t={t} editable={editMode} />
        ) : (
          <>
            {/* Visible blocks in their saved order */}
            {visibleBlocks.map(id => renderBlock(id, true))}
            {/* Hidden blocks only render in edit mode — admins use
                them to re-enable a section, but they have no value
                to a reader. */}
            {editMode && hiddenBlocks.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${C.border}` }}>
                <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: C.m, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
                  {t('marketplace.editor.hidden_blocks', 'Blocs masqués')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {hiddenBlocks.map(id => renderBlock(id, false))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
