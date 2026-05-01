// All block components for the marketplace WYSIWYG editor live here.
// Each block takes { tenant, page, onPatch, t } and renders an
// editable section. Editing primitives (EditableText,
// EditableTextarea, TagEditor) are shared across blocks.

import { useEffect, useRef, useState } from 'react';
import { Link as LinkIcon, Pencil, X, Plus, Eye, EyeOff, Trash2, Upload } from 'lucide-react';
import api from '../../lib/api';
import { showToast } from '../../components/Dialogs.jsx';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#fafbfc', border: '#e2e8f0' };
const g = (a, b) => `linear-gradient(135deg,${a},${b})`;

// ─── Editing primitives ──────────────────────────────────────────────

export function EditableText({ value, onChange, placeholder, multiline = false, style, className }) {
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
      className={className}
      onBlur={e => onChange(e.currentTarget.innerText.trim())}
      onKeyDown={e => { if (!multiline && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      data-placeholder={placeholder}
      style={{ outline: 'none', minWidth: 80, ...style }}
    />
  );
}

export function TagEditor({ tags, onChange, addLabel = 'Ajouter', dark = false }) {
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
          background: dark ? 'rgba(255,255,255,0.08)' : '#fff',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : C.border}`,
          color: dark ? '#cbd5e1' : C.s,
        }}>
          {tg}
          <button
            onClick={() => onChange(tags.filter((_, j) => j !== i))}
            aria-label={`Retirer ${tg}`}
            style={{
              background: dark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
              border: 'none', borderRadius: '50%', width: 18, height: 18,
              cursor: 'pointer', color: dark ? '#cbd5e1' : C.m,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, lineHeight: 1,
            }}
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
            background: 'transparent', border: `1px dashed ${dark ? 'rgba(255,255,255,0.25)' : C.border}`,
            color: dark ? '#94a3b8' : C.m, cursor: 'pointer',
          }}
        >+ {addLabel}</button>
      )}
    </div>
  );
}

// ─── Section header (label + title) ──────────────────────────────────

function SectionHeader({ label, title }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      {label && (
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
          {label}
        </p>
      )}
      {title && (
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: C.s, letterSpacing: -1 }}>{title}</h2>
      )}
    </div>
  );
}

const sectionShell = {
  background: '#fff', padding: 48, borderRadius: 20,
  border: `1px solid ${C.border}`,
};

// ─── Block: Hero ─────────────────────────────────────────────────────

export function HeroBlock({ tenant, onPatch, t }) {
  const heroLabel = t('marketplace.public.partner_program', 'Programme partenaire');
  return (
    <section style={{
      background: g(C.s, '#1e293b'),
      padding: '64px 32px', textAlign: 'center', borderRadius: 20,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <span style={{ display: 'inline-block', color: C.pl, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
          {heroLabel}
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
          {tenant.company_name}
        </h1>
        <div style={{ color: '#cbd5e1', fontSize: 17, margin: '0 auto 22px', lineHeight: 1.6, maxWidth: 620 }}>
          <EditableText
            value={tenant.short_description}
            onChange={v => onPatch({ short_description: v })}
            placeholder="Décrivez votre programme partenaires en une ligne…"
            multiline
            style={{ color: '#cbd5e1' }}
          />
        </div>
        {tenant.sector && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
              {tenant.sector}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Block: Tiers (read-only, link to Programme) ─────────────────────

export function TiersBlock({ t }) {
  return (
    <section style={sectionShell}>
      <SectionHeader
        label={t('marketplace.public.tiers_title', 'Niveaux partenaires')}
        title="Niveaux partenaires"
      />
      <div style={{
        textAlign: 'center', padding: 24,
        background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 14,
      }}>
        <p style={{ margin: '0 0 10px', color: C.m, fontSize: 14 }}>
          {t('marketplace.editor.tiers_note', 'Configuré dans Programme → Niveaux')}
        </p>
        <a
          href="/programme"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.p, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
        >
          <LinkIcon size={14} /> Configurer →
        </a>
      </div>
    </section>
  );
}

// ─── Block: Conditions ───────────────────────────────────────────────

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Math.random().toString(36).slice(2, 12);
}

export function ConditionsBlock({ page, onPatch, t }) {
  const items = Array.isArray(page.commission_blocks) ? page.commission_blocks : [];
  const updateItem = (id, patch) =>
    onPatch({ commission_blocks: items.map(it => it.id === id ? { ...it, ...patch } : it) });
  const removeItem = (id) =>
    onPatch({ commission_blocks: items.filter(it => it.id !== id) });
  const addItem = () =>
    onPatch({
      commission_blocks: [
        ...items,
        { id: newId(), metric: '0%', label: 'Nouveau libellé', description: '', is_primary: items.length === 0 },
      ],
    });

  const primary = items.find(it => it.is_primary) || items[0];
  const others = items.filter(it => it.id !== (primary && primary.id));

  return (
    <section style={sectionShell}>
      <SectionHeader
        label={t('marketplace.public.conditions_title', 'Conditions du programme')}
        title="Conditions du programme"
      />
      {primary && (
        <div style={{
          padding: 40, borderRadius: 24, background: g(C.s, '#1e293b'),
          color: '#fff', textAlign: 'center', marginBottom: 16,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, borderRadius: '50%', background: `${C.p}18` }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, letterSpacing: -2, background: g(C.pl, '#6ee7b7'), WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 12 }}>
              <EditableText
                value={primary.metric}
                onChange={v => updateItem(primary.id, { metric: v })}
                placeholder="0%"
                style={{ display: 'inline-block', color: 'transparent' }}
              />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              <EditableText
                value={primary.label}
                onChange={v => updateItem(primary.id, { label: v })}
                placeholder="Libellé"
                style={{ color: '#fff' }}
              />
            </div>
            <div style={{ color: '#cbd5e1', fontSize: 15, lineHeight: 1.5, maxWidth: 560, margin: '0 auto' }}>
              <EditableText
                value={primary.description}
                onChange={v => updateItem(primary.id, { description: v })}
                placeholder="Description…"
                multiline
                style={{ color: '#cbd5e1' }}
              />
            </div>
            <button
              onClick={() => removeItem(primary.id)}
              title="Supprimer"
              style={{ position: 'absolute', top: -28, right: -28, padding: 6, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', display: 'flex' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(others.length + 1, 3)},1fr)`,
        gap: 16,
      }}>
        {others.map(it => (
          <div key={it.id} style={{ padding: 28, borderRadius: 16, background: '#fff', border: `1px solid ${C.border}`, position: 'relative', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: C.p, letterSpacing: -1, marginBottom: 8 }}>
              <EditableText value={it.metric} onChange={v => updateItem(it.id, { metric: v })} placeholder="0" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.s, marginBottom: 4 }}>
              <EditableText value={it.label} onChange={v => updateItem(it.id, { label: v })} placeholder="Libellé" />
            </div>
            <div style={{ fontSize: 13, color: C.m, lineHeight: 1.55 }}>
              <EditableText value={it.description} onChange={v => updateItem(it.id, { description: v })} placeholder="Description…" multiline />
            </div>
            <button
              onClick={() => removeItem(it.id)}
              title="Supprimer"
              style={{ position: 'absolute', top: 8, right: 8, padding: 4, borderRadius: 6, background: '#fff', border: `1px solid ${C.border}`, color: C.m, cursor: 'pointer', display: 'flex' }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={addItem}
          style={{
            padding: 28, borderRadius: 16, background: 'transparent',
            border: `2px dashed ${C.border}`, color: C.m, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 100,
          }}
        >
          <Plus size={16} /> {t('marketplace.editor.add_condition', 'Ajouter une condition')}
        </button>
      </div>
    </section>
  );
}

// ─── Block: Ideal Client ─────────────────────────────────────────────

export function IdealClientBlock({ page, onPatch, t }) {
  return (
    <section style={sectionShell}>
      <SectionHeader
        label={t('marketplace.public.ideal_client', 'Client idéal')}
        title="Client idéal"
      />
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <EditableText
          value={page.ideal_client}
          onChange={v => onPatch({ ideal_client: v })}
          placeholder="Décrivez le profil de client idéal pour votre programme…"
          multiline
          style={{
            color: C.m, fontSize: 15, lineHeight: 1.7,
            padding: 12, borderRadius: 10,
            border: `1px dashed ${C.border}`,
            minHeight: 80, marginBottom: 16,
          }}
        />
        <TagEditor
          tags={page.ideal_client_tags || []}
          onChange={tags => onPatch({ ideal_client_tags: tags })}
          addLabel={t('marketplace.editor.add_tag', 'Ajouter')}
        />
      </div>
    </section>
  );
}

// ─── Block: Why Join ─────────────────────────────────────────────────

export function WhyJoinBlock({ page, onPatch, t }) {
  const items = Array.isArray(page.why_join) ? page.why_join : [];
  const updateItem = (id, patch) =>
    onPatch({ why_join: items.map(it => it.id === id ? { ...it, ...patch } : it) });
  const removeItem = (id) =>
    onPatch({ why_join: items.filter(it => it.id !== id) });
  const addItem = () =>
    onPatch({ why_join: [...items, { id: newId(), text: 'Nouvel avantage…' }] });

  return (
    <section style={sectionShell}>
      <SectionHeader
        label={t('marketplace.public.why_join', 'Pourquoi devenir partenaire')}
        title="Pourquoi devenir partenaire"
      />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14,
        maxWidth: 800, margin: '0 auto',
      }}>
        {items.map(it => (
          <div key={it.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: 14, borderRadius: 12,
            background: C.bg, border: `1px solid ${C.border}`,
            position: 'relative',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: `${C.p}15`, color: C.p,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 14, flexShrink: 0, marginTop: 2,
            }}>✓</div>
            <div style={{ flex: 1, color: C.s, fontSize: 14, lineHeight: 1.5 }}>
              <EditableText value={it.text} onChange={v => updateItem(it.id, { text: v })} placeholder="Avantage…" multiline />
            </div>
            <button
              onClick={() => removeItem(it.id)}
              title="Supprimer"
              style={{ padding: 4, borderRadius: 6, background: 'transparent', border: 'none', color: C.m, cursor: 'pointer', display: 'flex' }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={addItem}
          style={{
            padding: 14, borderRadius: 12, background: 'transparent',
            border: `2px dashed ${C.border}`, color: C.m, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Plus size={14} /> {t('marketplace.editor.add_advantage', 'Ajouter un avantage')}
        </button>
      </div>
    </section>
  );
}

// ─── Block: References (with upload modal) ───────────────────────────

function ReferenceModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url || null);
  const [uploading, setUploading] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Choisissez une image', 'error');
      return;
    }
    if (file.size > 1024 * 700) {
      showToast('Logo trop volumineux (700 KB max après encodage)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setLogoUrl(e.target.result);
    reader.onerror = () => showToast('Lecture du fichier échouée', 'error');
    reader.readAsDataURL(file);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: 24,
          width: '100%', maxWidth: 460,
          boxShadow: '0 25px 80px rgba(15,23,42,0.25)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: C.s }}>
          {initial ? 'Modifier la référence' : 'Ajouter une référence'}
        </h3>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.s, marginBottom: 6 }}>Logo</label>
          <div style={{
            width: '100%', height: 110, borderRadius: 12,
            border: `1px dashed ${C.border}`, background: C.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {logoUrl ? (
              <img src={logoUrl} alt={name} style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} />
            ) : (
              <span style={{ color: C.m, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Upload size={14} /> Cliquez pour téléverser
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={e => handleFile(e.target.files?.[0])}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.s, marginBottom: 6 }}>Nom *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Acme Corp"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.s, marginBottom: 6 }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Que dit le client de votre produit ?"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
              boxSizing: 'border-box', outline: 'none', resize: 'vertical',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '10px 18px', borderRadius: 10,
            background: '#fff', border: `1.5px solid ${C.border}`, color: C.s,
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Annuler</button>
          <button
            onClick={async () => {
              if (!name.trim()) { showToast('Nom requis', 'error'); return; }
              setUploading(true);
              try { await onSave({ name: name.trim(), description: description.trim(), logo_url: logoUrl }); }
              finally { setUploading(false); }
            }}
            disabled={uploading}
            style={{
              padding: '10px 18px', borderRadius: 10,
              background: C.p, border: 'none', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: uploading ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: uploading ? 0.7 : 1,
            }}
          >Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

export function ReferencesBlock({ page, onPatch, t }) {
  const refs = Array.isArray(page.client_references) ? page.client_references : [];
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', ref }

  const handleAdd = async ({ name, description, logo_url }) => {
    try {
      const r = await api.uploadMarketplaceReference({ name, description, dataUrl: logo_url });
      onPatch({ client_references: [...refs, r.reference] });
      setModal(null);
      showToast('Référence ajoutée', 'success');
    } catch (err) { showToast(err.message || 'Erreur', 'error'); }
  };
  const handleEdit = async ({ name, description, logo_url }) => {
    if (!modal?.ref) return;
    onPatch({
      client_references: refs.map(r => r.id === modal.ref.id ? { ...r, name, description, logo_url } : r),
    });
    setModal(null);
  };
  const handleDelete = async (id) => {
    try {
      await api.deleteMarketplaceReference(id);
      onPatch({ client_references: refs.filter(r => r.id !== id) });
    } catch (err) { showToast(err.message || 'Erreur', 'error'); }
  };

  return (
    <section style={sectionShell}>
      <SectionHeader
        label={t('marketplace.public.references', 'Ils nous font confiance')}
        title="Références clients"
      />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16,
      }}>
        {refs.map(r => (
          <div key={r.id} style={{
            padding: 20, borderRadius: 14, background: '#fff', border: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center',
            position: 'relative',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12, background: C.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 8, overflow: 'hidden',
            }}>
              {r.logo_url ? (
                <img src={r.logo_url} alt={r.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ color: C.m, fontWeight: 800, fontSize: 20 }}>{(r.name || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.s }}>{r.name}</div>
            {r.description && <div style={{ fontSize: 12, color: C.m, lineHeight: 1.5 }}>{r.description}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                onClick={() => setModal({ mode: 'edit', ref: r })}
                title="Modifier"
                style={{ padding: 5, borderRadius: 6, background: '#f1f5f9', border: 'none', color: C.s, cursor: 'pointer', display: 'flex' }}
              ><Pencil size={12} /></button>
              <button
                onClick={() => handleDelete(r.id)}
                title="Supprimer"
                style={{ padding: 5, borderRadius: 6, background: '#fef2f2', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex' }}
              ><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setModal({ mode: 'add' })}
          style={{
            padding: 28, borderRadius: 14, background: 'transparent',
            border: `2px dashed ${C.border}`, color: C.m, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 140,
          }}
        >
          <Plus size={16} /> {t('marketplace.editor.add_reference', 'Ajouter une référence')}
        </button>
      </div>
      {modal && (
        <ReferenceModal
          initial={modal.mode === 'edit' ? modal.ref : null}
          onClose={() => setModal(null)}
          onSave={modal.mode === 'edit' ? handleEdit : handleAdd}
        />
      )}
    </section>
  );
}

// ─── Block: Additional Info ──────────────────────────────────────────

export function AdditionalInfoBlock({ page, onPatch, t }) {
  const items = Array.isArray(page.additional_info) ? page.additional_info : [];
  const updateItem = (id, patch) =>
    onPatch({ additional_info: items.map(it => it.id === id ? { ...it, ...patch } : it) });
  const removeItem = (id) =>
    onPatch({ additional_info: items.filter(it => it.id !== id) });
  const addItem = () =>
    onPatch({ additional_info: [...items, { id: newId(), label: 'Libellé', value: 'Valeur' }] });

  return (
    <section style={sectionShell}>
      <SectionHeader
        label={t('marketplace.public.additional_info', 'Informations complémentaires')}
        title="Informations complémentaires"
      />
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 16, color: C.m, fontSize: 13 }}>
            Aucune information pour le moment.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {items.map(it => (
              <div key={it.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'center',
                padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontWeight: 700, color: C.s, fontSize: 14 }}>
                  <EditableText value={it.label} onChange={v => updateItem(it.id, { label: v })} placeholder="Libellé" />
                </div>
                <div style={{ color: C.m, fontSize: 14 }}>
                  <EditableText value={it.value} onChange={v => updateItem(it.id, { value: v })} placeholder="Valeur" />
                </div>
                <button
                  onClick={() => removeItem(it.id)}
                  title="Supprimer"
                  style={{ padding: 4, borderRadius: 6, background: 'transparent', border: 'none', color: C.m, cursor: 'pointer', display: 'flex' }}
                ><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={addItem}
          style={{
            padding: '10px 16px', borderRadius: 10, background: 'transparent',
            border: `2px dashed ${C.border}`, color: C.m, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Plus size={14} /> {t('marketplace.editor.add_info', 'Ajouter une information')}
        </button>
      </div>
    </section>
  );
}

// ─── Block: About ────────────────────────────────────────────────────

export function AboutBlock({ tenant, page, onPatch, t }) {
  return (
    <section style={sectionShell}>
      <SectionHeader
        label={t('marketplace.public.about_title', 'À propos')}
        title={t('marketplace.public.discover', { company: tenant.company_name, defaultValue: 'Découvrez {{company}}' })}
      />
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <EditableText
          value={page.page_description}
          onChange={v => onPatch({ page_description: v })}
          placeholder="Présentez votre activité, votre proposition de valeur, vos cibles privilégiées…"
          multiline
          style={{
            color: C.m, fontSize: 15, lineHeight: 1.7,
            padding: 12, borderRadius: 10,
            border: `1px dashed ${C.border}`, minHeight: 140,
          }}
        />
      </div>
    </section>
  );
}

// ─── Block: CTA (auto-generated, not editable) ───────────────────────

export function CtaBlock({ tenant, t }) {
  return (
    <section style={{
      background: g('#ecfdf5', '#d1fae5'),
      padding: 48, borderRadius: 20, textAlign: 'center',
      border: `1px solid #a7f3d0`,
    }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 800, color: C.s }}>
        Rejoindre le programme {tenant.company_name}
      </h2>
      <p style={{ margin: '0 0 20px', color: C.m, fontSize: 15, lineHeight: 1.55 }}>
        Postulez en quelques clics et démarrez à votre rythme.
      </p>
      <span style={{
        display: 'inline-block', padding: '12px 28px', borderRadius: 12,
        background: C.s, color: '#fff', fontWeight: 700, fontSize: 14,
      }}>
        {t('marketplace.public.apply_now', 'Postuler maintenant')} →
      </span>
    </section>
  );
}

// Block id → component map. Used by the editor and (later) the public
// page renderer.
export const BLOCK_COMPONENTS = {
  hero: HeroBlock,
  tiers: TiersBlock,
  conditions: ConditionsBlock,
  about: AboutBlock,
  ideal_client: IdealClientBlock,
  why_join: WhyJoinBlock,
  references: ReferencesBlock,
  additional_info: AdditionalInfoBlock,
  cta: CtaBlock,
};
