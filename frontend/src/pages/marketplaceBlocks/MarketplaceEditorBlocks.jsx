// All block components for the marketplace WYSIWYG editor live here.
// Each block takes { tenant, page, onPatch, t } and renders an
// editable section that visually mirrors its public counterpart in
// MarketplaceProgramPage.jsx. Editing primitives (EditableText,
// TagEditor) are shared across blocks.

import { useEffect, useRef, useState } from 'react';
import { Link as LinkIcon, Pencil, X, Plus, Trash2, Upload, Award } from 'lucide-react';
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
      {(tags || []).map((tg, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 600,
          padding: '6px 6px 6px 14px', borderRadius: 999,
          background: dark ? 'rgba(255,255,255,0.08)' : '#f0fdf4',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : '#bbf7d0'}`,
          color: dark ? '#cbd5e1' : '#059669',
        }}>
          {tg}
          <button
            onClick={() => onChange(tags.filter((_, j) => j !== i))}
            aria-label={`Retirer ${tg}`}
            style={{
              background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(5,150,105,0.12)',
              border: 'none', borderRadius: '50%', width: 18, height: 18,
              cursor: 'pointer', color: dark ? '#cbd5e1' : '#059669',
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
            fontSize: 13, padding: '6px 14px', borderRadius: 999,
            border: `1.5px solid ${C.p}`, outline: 'none',
            width: 140, fontFamily: 'inherit',
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            fontSize: 13, fontWeight: 600,
            padding: '6px 14px', borderRadius: 999,
            background: 'transparent', border: `1px dashed ${dark ? 'rgba(255,255,255,0.25)' : C.border}`,
            color: dark ? '#94a3b8' : C.m, cursor: 'pointer',
          }}
        >+ {addLabel}</button>
      )}
    </div>
  );
}

// ─── Section header (label + title), matches public page ─────────────

function SectionHeader({ label, title }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      {label && (
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
          {label}
        </p>
      )}
      {title && (
        <h2 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>{title}</h2>
      )}
    </div>
  );
}

// Used for sections that paint on a white card with a subtle border.
const sectionCard = {
  background: '#fff', padding: '64px 32px', borderRadius: 20,
  border: `1px solid ${C.border}`,
};

// Sections that should look like a full-bleed band on the public page —
// in the editor we render them as a card with the same internal layout.
const sectionBand = {
  background: C.bg, padding: '56px 32px', borderRadius: 20,
  border: `1px solid ${C.border}`,
};

// ─── Block: Hero ─────────────────────────────────────────────────────

function LogoEditor({ tenant, onPatch }) {
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('Choisissez une image', 'error');
    if (file.size > 500 * 1024) return showToast('Logo trop volumineux (500 KB max)', 'error');
    const reader = new FileReader();
    reader.onload = (ev) => onPatch({ logo_url: ev.target.result });
    reader.onerror = () => showToast('Lecture du fichier échouée', 'error');
    reader.readAsDataURL(file);
  };
  return (
    <label style={{
      width: 84, height: 84, borderRadius: 20, background: '#fff',
      margin: '0 auto 24px', position: 'relative', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14,
      boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
    }}>
      {tenant.logo_url ? (
        <img src={tenant.logo_url} alt={tenant.company_name || ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <span style={{ color: C.m, fontWeight: 800, fontSize: 32 }}>
          {(tenant.company_name || '?').charAt(0).toUpperCase()}
        </span>
      )}
      <input type="file" accept="image/*" onChange={handleFile}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
      <span style={{
        position: 'absolute', bottom: -8, right: -8,
        width: 30, height: 30, borderRadius: '50%',
        background: C.p, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(5,150,105,0.4)',
        border: '2px solid #fff', pointerEvents: 'none',
      }}>
        <Pencil size={13} />
      </span>
    </label>
  );
}

export function HeroBlock({ tenant, onPatch, t }) {
  return (
    <section style={{
      background: g(C.s, '#1e293b'),
      padding: '80px 32px 64px', textAlign: 'center', borderRadius: 20,
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <span style={{ display: 'inline-block', color: C.pl, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>
          {t('marketplace.public.partner_program', 'Programme partenaire')}
        </span>

        <LogoEditor tenant={tenant} onPatch={onPatch} />

        <h1 style={{ margin: '0 0 16px', fontSize: 'clamp(32px,5vw,48px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -1 }}>
          <EditableText
            value={tenant.company_name}
            onChange={v => onPatch({ company_name: v })}
            placeholder={t('marketplace.editor.company_name_ph', 'Nom de votre entreprise')}
            style={{ color: '#fff' }}
          />
        </h1>

        <div style={{ margin: '0 auto 28px', fontSize: 17, color: '#cbd5e1', lineHeight: 1.6, maxWidth: 640 }}>
          <EditableText
            value={tenant.short_description}
            onChange={v => onPatch({ short_description: v })}
            placeholder={t('marketplace.editor.short_desc_ph', 'Décrivez votre programme partenaires en une ligne…')}
            multiline
            style={{ color: '#cbd5e1' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tenant.sector && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
              {tenant.sector}
            </span>
          )}
          {tenant.icp && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1' }}>
              {tenant.icp}
            </span>
          )}
          {!tenant.sector && !tenant.icp && (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              {t('marketplace.editor.badges_hint', 'Ajoutez secteur et ICP dans Paramètres pour afficher des badges')}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Block: Tiers (read-only, fetches real tenant_levels) ────────────

export function TiersBlock({ t }) {
  const [data, setData] = useState({ levels: [], threshold_type: 'deals', loading: true });
  useEffect(() => {
    api.getTenantLevels()
      .then(d => setData({ levels: d.levels || [], threshold_type: d.threshold_type || 'deals', loading: false }))
      .catch(() => setData({ levels: [], threshold_type: 'deals', loading: false }));
  }, []);

  const { levels, threshold_type, loading } = data;
  const formatThreshold = (lvl) => {
    if (!lvl.min_threshold || Number(lvl.min_threshold) === 0) return t('marketplace.editor.tiers_starting', 'Niveau de départ');
    if (threshold_type === 'volume') {
      return t('marketplace.editor.tiers_volume', 'À partir de {{n}} € de CA', { n: Number(lvl.min_threshold).toLocaleString('fr-FR') });
    }
    return t('marketplace.editor.tiers_deals', 'À partir de {{n}} ventes', { n: Number(lvl.min_threshold) });
  };

  return (
    <section style={sectionCard}>
      <SectionHeader
        label={t('marketplace.public.tiers_title', 'Niveaux partenaires')}
        title={t('marketplace.editor.tiers_heading', 'Récompensez vos meilleurs partenaires')}
      />

      {loading ? (
        <div style={{ textAlign: 'center', color: C.m, fontSize: 14, padding: 24 }}>Chargement…</div>
      ) : levels.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 32,
          background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 14,
        }}>
          <Award size={28} color={C.m} style={{ marginBottom: 10 }} />
          <p style={{ margin: '0 0 12px', color: C.s, fontWeight: 600, fontSize: 15 }}>
            {t('marketplace.editor.tiers_empty_title', 'Aucun niveau configuré')}
          </p>
          <a
            href="/programme"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.p, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
          >
            <LinkIcon size={14} /> {t('marketplace.editor.tiers_configure', 'Configurer dans Programme → Niveaux')} →
          </a>
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
            gap: 16,
          }}>
            {levels.map(lvl => {
              const tierColor = lvl.color || C.p;
              return (
                <div key={lvl.id} style={{
                  padding: 28, borderRadius: 18,
                  background: '#fff', border: `1px solid ${C.border}`,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                  textAlign: 'center', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    height: 4, background: tierColor,
                  }} />
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 12px', borderRadius: 999,
                    background: tierColor + '22', color: tierColor,
                    fontSize: 12, fontWeight: 800, letterSpacing: 1,
                    textTransform: 'uppercase', marginBottom: 14, marginTop: 4,
                  }}>
                    {lvl.icon ? `${lvl.icon} ` : ''}{lvl.name}
                  </span>
                  <div style={{ fontSize: 36, fontWeight: 900, color: C.s, letterSpacing: -1, marginBottom: 6 }}>
                    {Number(lvl.commission_rate)}%
                  </div>
                  <div style={{ fontSize: 13, color: C.m, marginBottom: 10, fontWeight: 600 }}>
                    {t('marketplace.editor.tiers_commission', 'de commission')}
                  </div>
                  <div style={{ fontSize: 13, color: C.m, lineHeight: 1.5 }}>
                    {formatThreshold(lvl)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <a
              href="/programme"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.m, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              <LinkIcon size={12} /> {t('marketplace.editor.tiers_edit', 'Modifier dans Programme → Niveaux')} →
            </a>
          </div>
        </>
      )}
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
    <section style={sectionCard}>
      <SectionHeader
        label={t('marketplace.public.conditions_title', 'Conditions du programme')}
        title={t('marketplace.editor.conditions_heading', 'Une rémunération transparente')}
      />
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {primary && (
          <div className="rb-card-hover-parent" style={{
            padding: 56, borderRadius: 24, background: g(C.s, '#1e293b'),
            color: '#fff', textAlign: 'center', marginBottom: 16,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, borderRadius: '50%', background: `${C.p}18` }} />
            <button
              onClick={() => removeItem(primary.id)}
              title="Supprimer"
              className="rb-card-hover-only"
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 2,
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0, transition: 'opacity .15s',
              }}
            >
              <Trash2 size={14} />
            </button>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 'clamp(48px,9vw,96px)', fontWeight: 900, lineHeight: 1, letterSpacing: -3, background: g(C.pl, '#6ee7b7'), WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 16 }}>
                <EditableText
                  value={primary.metric}
                  onChange={v => updateItem(primary.id, { metric: v })}
                  placeholder="0%"
                  style={{ display: 'inline-block', color: 'transparent' }}
                />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
                <EditableText
                  value={primary.label}
                  onChange={v => updateItem(primary.id, { label: v })}
                  placeholder="Libellé"
                  style={{ color: '#fff' }}
                />
              </div>
              <div style={{ color: '#cbd5e1', fontSize: 17, lineHeight: 1.5, maxWidth: 620, margin: '0 auto' }}>
                <EditableText
                  value={primary.description}
                  onChange={v => updateItem(primary.id, { description: v })}
                  placeholder="Description…"
                  multiline
                  style={{ color: '#cbd5e1' }}
                />
              </div>
            </div>
          </div>
        )}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
          gap: 16,
        }}>
          {others.map(it => (
            <div key={it.id} className="rb-card-hover-parent" style={{
              padding: 32, borderRadius: 20, background: '#fff', border: `1px solid ${C.border}`,
              boxShadow: '0 2px 10px rgba(0,0,0,0.04)', position: 'relative', textAlign: 'center',
            }}>
              <button
                onClick={() => removeItem(it.id)}
                title="Supprimer"
                className="rb-card-hover-only"
                style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 26, height: 26, borderRadius: 8,
                  background: '#fff', border: `1px solid ${C.border}`,
                  color: C.m, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity .15s',
                }}
              >
                <X size={14} />
              </button>
              <div style={{ fontSize: 36, fontWeight: 900, color: C.p, letterSpacing: -1, marginBottom: 8 }}>
                <EditableText value={it.metric} onChange={v => updateItem(it.id, { metric: v })} placeholder="0" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.s, marginBottom: 4 }}>
                <EditableText value={it.label} onChange={v => updateItem(it.id, { label: v })} placeholder="Libellé" />
              </div>
              <div style={{ fontSize: 13, color: C.m, lineHeight: 1.55 }}>
                <EditableText value={it.description} onChange={v => updateItem(it.id, { description: v })} placeholder="Description…" multiline />
              </div>
            </div>
          ))}
          <button
            onClick={addItem}
            style={{
              padding: 32, borderRadius: 20, background: 'transparent',
              border: `2px dashed ${C.border}`, color: C.m, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 130,
            }}
          >
            <Plus size={16} /> {t('marketplace.editor.add_condition', 'Ajouter une condition')}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Block: Ideal Client ─────────────────────────────────────────────

export function IdealClientBlock({ page, onPatch, t }) {
  return (
    <section style={sectionCard}>
      <SectionHeader
        label={t('marketplace.public.ideal_client', 'Client idéal')}
        title={t('marketplace.editor.ideal_client_heading', 'Le profil parfait à recommander')}
      />
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <EditableText
          value={page.ideal_client}
          onChange={v => onPatch({ ideal_client: v })}
          placeholder="Décrivez le profil de client idéal pour votre programme…"
          multiline
          style={{
            color: C.m, fontSize: 16, lineHeight: 1.75, textAlign: 'center',
            padding: 16, borderRadius: 12,
            border: `1px dashed ${C.border}`,
            minHeight: 80, marginBottom: 20,
          }}
        />
        <TagEditor
          tags={page.ideal_client_tags || []}
          onChange={tags => onPatch({ ideal_client_tags: tags })}
          addLabel={t('marketplace.editor.add_tag', 'Ajouter un critère')}
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
    <section style={sectionBand}>
      <SectionHeader
        label={t('marketplace.public.why_join', 'Pourquoi devenir partenaire')}
        title={t('marketplace.editor.why_join_heading', 'Les avantages du programme')}
      />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16,
        maxWidth: 1000, margin: '0 auto',
      }}>
        {items.map(it => (
          <div key={it.id} className="rb-card-hover-parent" style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: 20, borderRadius: 14,
            background: '#fff', border: `1px solid ${C.border}`,
            position: 'relative',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `${C.p}15`, color: C.p,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 16, flexShrink: 0, marginTop: 2,
            }}>✓</div>
            <div style={{ flex: 1, color: C.s, fontSize: 15, lineHeight: 1.6, minWidth: 0 }}>
              <EditableText value={it.text} onChange={v => updateItem(it.id, { text: v })} placeholder="Avantage…" multiline />
            </div>
            <button
              onClick={() => removeItem(it.id)}
              title="Supprimer"
              className="rb-card-hover-only"
              style={{
                padding: 4, borderRadius: 6, background: 'transparent', border: 'none',
                color: C.m, cursor: 'pointer', display: 'flex',
                opacity: 0, transition: 'opacity .15s',
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={addItem}
          style={{
            padding: 20, borderRadius: 14, background: 'transparent',
            border: `2px dashed ${C.border}`, color: C.m, cursor: 'pointer',
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 70,
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
  const [modal, setModal] = useState(null);

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
    <section style={sectionCard}>
      <SectionHeader
        label={t('marketplace.public.references', 'Ils nous font confiance')}
        title={t('marketplace.editor.references_heading', 'Références clients')}
      />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18,
        maxWidth: 1100, margin: '0 auto',
      }}>
        {refs.map(r => (
          <div key={r.id} className="rb-card-hover-parent" style={{
            padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center',
            position: 'relative', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          }}>
            <div className="rb-card-hover-only" style={{
              position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6,
              opacity: 0, transition: 'opacity .15s',
            }}>
              <button
                onClick={() => setModal({ mode: 'edit', ref: r })}
                title="Modifier"
                style={{
                  width: 26, height: 26, borderRadius: 8, background: '#fff',
                  border: `1px solid ${C.border}`, color: C.s, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><Pencil size={12} /></button>
              <button
                onClick={() => handleDelete(r.id)}
                title="Supprimer"
                style={{
                  width: 26, height: 26, borderRadius: 8, background: '#fef2f2',
                  border: `1px solid #fecaca`, color: '#dc2626', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><Trash2 size={12} /></button>
            </div>
            <div style={{
              width: 64, height: 64, borderRadius: 14, background: C.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 10, overflow: 'hidden',
            }}>
              {r.logo_url ? (
                <img src={r.logo_url} alt={r.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ color: C.m, fontWeight: 800, fontSize: 22 }}>{(r.name || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.s }}>{r.name}</div>
            {r.description && <p style={{ margin: 0, fontSize: 13, color: C.m, lineHeight: 1.5 }}>{r.description}</p>}
          </div>
        ))}
        <button
          onClick={() => setModal({ mode: 'add' })}
          style={{
            padding: 28, borderRadius: 16, background: 'transparent',
            border: `2px dashed ${C.border}`, color: C.m, cursor: 'pointer',
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 160,
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
    <section style={sectionBand}>
      <SectionHeader
        label={t('marketplace.public.additional_info', 'Informations complémentaires')}
        title={t('marketplace.editor.additional_info_heading', 'Tout ce qu\'il faut savoir')}
      />
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {items.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 14 }}>
            {items.map((it, i) => (
              <div key={it.id} className="rb-card-hover-parent" style={{
                display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 16, alignItems: 'center',
                padding: '14px 20px',
                borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
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
                  className="rb-card-hover-only"
                  style={{
                    padding: 4, borderRadius: 6, background: 'transparent', border: 'none',
                    color: C.m, cursor: 'pointer', display: 'flex',
                    opacity: 0, transition: 'opacity .15s',
                  }}
                ><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={addItem}
          style={{
            padding: '12px 20px', borderRadius: 12, background: 'transparent',
            border: `2px dashed ${C.border}`, color: C.m, cursor: 'pointer',
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 8,
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
    <section style={sectionBand}>
      <SectionHeader
        label={t('marketplace.public.about_title', 'À propos')}
        title={t('marketplace.public.discover', { company: tenant.company_name, defaultValue: 'Découvrez {{company}}' })}
      />
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <EditableText
          value={page.page_description}
          onChange={v => onPatch({ page_description: v })}
          placeholder="Présentez votre activité, votre proposition de valeur, vos cibles privilégiées…"
          multiline
          style={{
            color: C.m, fontSize: 16, lineHeight: 1.75,
            padding: 18, borderRadius: 12,
            border: `1px dashed ${C.border}`, minHeight: 160,
            background: '#fff',
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
      background: g(C.s, '#1e293b'),
      padding: '72px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      borderRadius: 20,
    }}>
      <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: `${C.p}10` }} />
      <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto', zIndex: 1 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 'clamp(26px,4vw,36px)', fontWeight: 800, color: '#fff', letterSpacing: -1 }}>
          {t('marketplace.editor.cta_title', { company: tenant.company_name, defaultValue: 'Rejoindre le programme {{company}}' })}
        </h2>
        <p style={{ margin: '0 0 28px', fontSize: 17, color: '#cbd5e1', lineHeight: 1.6 }}>
          {t('marketplace.editor.cta_body', 'Postulez en quelques clics et démarrez à votre rythme.')}
        </p>
        <span style={{
          display: 'inline-block', padding: '15px 32px', borderRadius: 14,
          background: g(C.p, C.pl), color: '#fff', textDecoration: 'none',
          fontWeight: 700, fontSize: 16, boxShadow: `0 8px 30px ${C.p}40`,
        }}>
          {t('marketplace.public.apply_now', 'Postuler maintenant')} →
        </span>
        <p style={{ margin: '20px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
          {t('marketplace.editor.cta_hint', 'Bloc généré automatiquement — non modifiable')}
        </p>
      </div>
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
