import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Save, Languages, ExternalLink } from 'lucide-react';
import api from '../lib/api';
import { showToast } from '../components/Dialogs.jsx';

// WYSIWYG editor for the public /marketplace/:slug page. Top bar +
// blocks. Save is debounced 2s after any field change. Block-level
// drag-and-drop reorder, visibility toggling, and the remaining
// block types (Conditions, Ideal Client, Why Join, References,
// Additional Info, Tiers, CTA) ship in follow-up commits.

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#fafbfc', border: '#e2e8f0' };

function StatusBadge({ visible }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
      background: visible ? '#f0fdf4' : '#f1f5f9',
      color: visible ? '#059669' : '#64748b',
    }}>{visible ? 'Publié' : 'Brouillon'}</span>
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

// Generic single-line contenteditable. onBlur commits, Enter blurs.
function EditableText({ value, onChange, placeholder, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.innerText !== (value || '')) {
      ref.current.innerText = value || '';
    }
  }, [value]);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={e => onChange(e.currentTarget.innerText.trim())}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      data-placeholder={placeholder}
      style={{
        outline: 'none', minWidth: 80,
        ...style,
      }}
    />
  );
}

function EditableTextarea({ value, onChange, placeholder, minHeight = 80, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.innerText !== (value || '')) {
      ref.current.innerText = value || '';
    }
  }, [value]);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={e => onChange(e.currentTarget.innerText.trim())}
      data-placeholder={placeholder}
      style={{
        outline: 'none', minHeight, padding: 10, borderRadius: 10,
        border: `1px dashed transparent`, transition: 'border-color .15s',
        ...style,
      }}
      onFocus={e => { e.currentTarget.style.borderColor = C.border; }}
      onMouseEnter={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = C.border; }}
      onMouseLeave={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = 'transparent'; }}
    />
  );
}

// Chip list with click-to-remove + inline add input.
function TagEditor({ tags, onChange, addLabel = 'Ajouter' }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim();
    if (v && !(tags || []).includes(v)) onChange([...(tags || []), v]);
    setDraft(''); setAdding(false);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {(tags || []).map((tg, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600,
          padding: '4px 4px 4px 10px', borderRadius: 999,
          background: '#fff', border: `1px solid ${C.border}`, color: C.s,
        }}>
          {tg}
          <button
            onClick={() => onChange(tags.filter((_, j) => j !== i))}
            aria-label={`Retirer ${tg}`}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: C.m, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1 }}
          >×</button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setDraft(''); setAdding(false); }
          }}
          placeholder="…"
          style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 999,
            border: `1.5px solid ${C.p}`, outline: 'none',
            width: 120, fontFamily: 'inherit',
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            fontSize: 12, fontWeight: 600,
            padding: '4px 10px', borderRadius: 999,
            background: 'transparent', border: `1px dashed ${C.border}`,
            color: C.m, cursor: 'pointer',
          }}
        >+ {addLabel}</button>
      )}
    </div>
  );
}

// ─── Block: Hero ─────────────────────────────────────────────────────
function HeroBlock({ tenant, page, onPatch }) {
  return (
    <section style={{
      background: `linear-gradient(135deg, ${C.s} 0%, #1e293b 100%)`,
      padding: '64px 32px', textAlign: 'center', borderRadius: 20,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <span style={{ display: 'inline-block', color: C.pl, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
          Programme partenaire
        </span>
        {tenant.logo_url && (
          <div style={{
            width: 72, height: 72, borderRadius: 18, background: '#fff',
            margin: '0 auto 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          }}>
            <img src={tenant.logo_url} alt={tenant.company_name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        )}
        <h1 style={{ margin: '0 0 16px', fontSize: 'clamp(28px,5vw,44px)', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
          <EditableText
            value={tenant.company_name}
            onChange={v => onPatch({ /* company_name lives on tenants.name — read-only here */ })}
            placeholder="Nom de la société"
            style={{ color: '#fff', cursor: 'default' }}
          />
        </h1>
        <div style={{ color: '#94a3b8', fontSize: 17, margin: '0 auto 22px', lineHeight: 1.6, maxWidth: 620 }}>
          <EditableText
            value={tenant.short_description}
            onChange={v => onPatch({ short_description: v })}
            placeholder="Décrivez votre programme partenaires en une ligne…"
            style={{ color: '#cbd5e1' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
          {tenant.sector && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
              {tenant.sector}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Block: About ────────────────────────────────────────────────────
function AboutBlock({ tenant, page, onPatch }) {
  return (
    <section style={{
      background: '#fff', padding: 48, borderRadius: 20,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center', marginBottom: 28 }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
          À propos
        </p>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: C.s, letterSpacing: -1 }}>
          Découvrez {tenant.company_name}
        </h2>
      </div>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <EditableTextarea
          value={page.page_description}
          onChange={v => onPatch({ page_description: v })}
          placeholder="Présentez votre activité, votre proposition de valeur, vos cibles privilégiées…"
          minHeight={140}
          style={{ color: C.m, fontSize: 15, lineHeight: 1.7 }}
        />
      </div>
    </section>
  );
}

// ─── Block placeholders for future slices ────────────────────────────
function PlaceholderBlock({ id }) {
  return (
    <section style={{
      background: '#fff', padding: 48, borderRadius: 20,
      border: `1px dashed ${C.border}`, textAlign: 'center', color: C.m,
    }}>
      <p style={{ margin: 0, fontSize: 13 }}>
        Bloc « {id} » — éditeur en cours d'implémentation. Disponible dans le prochain commit.
      </p>
    </section>
  );
}

// ─── Editor page ─────────────────────────────────────────────────────
export default function MarketplaceEditorPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [page, setPage] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [translateRunning, setTranslateRunning] = useState(false);

  // Track in-flight pending changes that haven't been flushed yet so a
  // page navigation away doesn't lose them. Saved is keyed off the
  // last successful PUT; debounce flushes on every dirty change.
  const dirtyRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.getMarketplacePage()
      .then(d => { setTenant(d.tenant); setPage(d.page); })
      .catch(err => showToast(err.message || 'Erreur', 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Debounced save (2s after the last edit). Sends only the diff
  // accumulated in dirtyRef so a paragraph edit doesn't ship the
  // whole page payload.
  const flush = async () => {
    if (!dirtyRef.current) return;
    const payload = dirtyRef.current;
    dirtyRef.current = null;
    setSaving(true);
    try {
      const r = await api.updateMarketplacePage(payload);
      setTenant(r.tenant); setPage(r.page);
      setSavedAt(new Date());
      showToast(t('marketplace.editor.saved', 'Sauvegardé') + ' ✓', 'success', 1800);
    } catch (err) {
      showToast(err.message || 'Erreur sauvegarde', 'error');
      // Re-merge the failed payload so the next debounce retries.
      dirtyRef.current = { ...payload, ...(dirtyRef.current || {}) };
    }
    setSaving(false);
  };

  const onPatch = (patch) => {
    // Optimistic local update so the UI feels instant.
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

  // Flush on unmount so navigation away doesn't drop pending edits.
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
      if (code === 'anthropic_key_missing') {
        showToast('ANTHROPIC_API_KEY manquant côté serveur', 'error');
      } else if (code === 'already_running') {
        showToast(t('marketplace.editor.translate_running', 'Traduction déjà en cours'), 'info');
      } else {
        showToast(err.message || 'Erreur', 'error');
      }
    }
    setTranslateRunning(false);
  };

  const openPreview = () => {
    if (!tenant?.slug) return;
    window.open('/marketplace/' + tenant.slug, '_blank', 'noopener');
  };

  if (loading) {
    return (
      <div style={{ padding: 32, color: C.m, fontSize: 14 }}>
        Chargement…
      </div>
    );
  }
  if (!tenant) {
    return (
      <div style={{ padding: 32, color: C.m, fontSize: 14 }}>
        Tenant introuvable.
      </div>
    );
  }

  const blocks = Array.isArray(page?.page_blocks) && page.page_blocks.length
    ? page.page_blocks
    : ['hero', 'tiers', 'conditions', 'about', 'ideal_client', 'why_join', 'references', 'additional_info', 'cta'];

  const blockProps = { tenant, page, onPatch };
  const renderBlock = (id) => {
    switch (id) {
      case 'hero':            return <HeroBlock {...blockProps} />;
      case 'about':           return <AboutBlock {...blockProps} />;
      case 'tiers':
      case 'conditions':
      case 'ideal_client':
      case 'why_join':
      case 'references':
      case 'additional_info':
      case 'cta':
      default:
        return <PlaceholderBlock id={id} />;
    }
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
          <StatusBadge visible={!!tenant.marketplace_visible} />
          {saving && <span style={{ color: C.m, fontSize: 12 }}>Enregistrement…</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.s, cursor: 'pointer' }}>
            <Toggle
              value={!!tenant.marketplace_visible}
              onChange={v => onPatch({ marketplace_visible: v })}
            />
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

      {/* Body — blocks in order */}
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {blocks.map(id => (
          <div key={id} style={{ position: 'relative' }}>
            {renderBlock(id)}
          </div>
        ))}
      </div>
    </div>
  );
}
