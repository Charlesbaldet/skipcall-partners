import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Share2,
  Copy, Check, Globe, X, Eye, EyeOff, AlertTriangle, Link2,
  Type, Mail, Phone, ListChecks, CheckSquare, Circle, Calendar as CalendarIcon, Hash,
  AlignLeft, ChevronDown, RotateCcw, Loader2, BarChart2,
} from 'lucide-react';
import api from '../lib/api';
import { showToast } from '../components/Dialogs.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import Pagination from '../components/Pagination.jsx';
import { FormPreview } from './PublicFormPage.jsx';

// Per-type metadata that drives the field type picker + the rendered
// badge on each row. Single source of truth so adding a type (V2) is
// one entry, not a hunt across the file.
// 'appointment' was removed from this list when appointment moved to a
// form-level setting (forms.appointment_enabled + appointment_url,
// see migration v50). The Rendez-vous section in the settings sidebar
// now toggles the embed; the public page renders the iframe on the
// thank-you screen instead of as a field.
const FIELD_TYPES = [
  { key: 'text_short',   icon: Type,         hasOptions: false },
  { key: 'text_long',    icon: AlignLeft,    hasOptions: false },
  { key: 'email',        icon: Mail,         hasOptions: false },
  { key: 'phone',        icon: Phone,        hasOptions: false },
  { key: 'dropdown',     icon: ChevronDown,  hasOptions: true  },
  { key: 'multi_select', icon: ListChecks,   hasOptions: true  },
  { key: 'radio',        icon: Circle,       hasOptions: true  },
  { key: 'date',         icon: CalendarIcon, hasOptions: false },
  { key: 'number',       icon: Hash,         hasOptions: false },
];

// field_role values reserved for the 6 standard lead fields auto-
// seeded at form creation. Deleting one triggers a stronger
// confirmation modal because the corresponding referrals column will
// stay empty on form-originated leads going forward.
const STANDARD_ROLES = new Set([
  'contact_first_name', 'contact_last_name',
  'prospect_email', 'prospect_phone',
  'prospect_company', 'prospect_role',
]);

const TYPE_META = Object.fromEntries(FIELD_TYPES.map(t => [t.key, t]));

const MIN_STEPS = 1;
const MAX_STEPS = 5;

function stepsArray(n) {
  const out = [];
  for (let i = 1; i <= (n || 3); i++) out.push(i);
  return out;
}

// Public form URL pattern. The actual public route lands in étape 3
// but we already build the partner share link here because that's the
// whole point of generating tokens. The FE-only constant keeps the
// share-link rendering self-contained.
function publicFormUrl(formId, token) {
  if (typeof window === 'undefined') return '';
  return window.location.origin + '/f/' + formId + (token ? '?p=' + token : '');
}

export default function FormBuilderPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(1);
  const [editingField, setEditingField] = useState(null);     // field row or { __new: true, step }
  const [confirmDelete, setConfirmDelete] = useState(null);   // field row pending delete
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemoveStep, setConfirmRemoveStep] = useState(null); // { step, count, target } pending step removal
  // Builder mode mirrors the Marketplace settings tab: default to a
  // read-only preview, an "Éditer" button flips us into the edit UI.
  // Local state — no URL sync (intentional: a refresh resets to
  // preview, matching the user's "this is what visitors see" mental
  // model).
  const [mode, setMode] = useState('preview');
  const [confirmRestoreDefaults, setConfirmRestoreDefaults] = useState(false);
  // Autosave indicator state. Every API operation that mutates the
  // form transits through `wrapSave` which flips this state. UI
  // chrome lives next to the mode toggle. Auto-fades 'saved' back to
  // 'idle' after 2s; 'error' stays sticky until the user retries.
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  const load = async () => {
    try {
      const { form: f } = await api.getForm();
      setForm(f);
      if (f) {
        const { fields: fs } = await api.getFormFields(f.id);
        setFields(fs || []);
      } else {
        setFields([]);
      }
    } catch (err) {
      console.error('[FormBuilder.load]', err);
      showToast(err.message || 'Erreur', 'error', 4000);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Single funnel for every mutating API call. Drives saveState
  // ('idle' → 'saving' → 'saved' → fade back to 'idle' after 2s).
  // Errors bubble up so callers can revert optimistic UI; the
  // indicator stays in 'error' state until the next attempt.
  const wrapSave = async (fn) => {
    setSaveState('saving');
    try {
      const r = await fn();
      setSaveState('saved');
      setTimeout(() => setSaveState(s => s === 'saved' ? 'idle' : s), 2000);
      return r;
    } catch (err) {
      setSaveState('error');
      throw err;
    }
  };

  // ─── Form-level actions ──────────────────────────────────────────
  const createForm = async () => {
    try {
      const { form: f } = await api.createForm({
        title: t('forms.builder.default_title', 'Inscrivez-vous à notre programme'),
      });
      setForm(f);
      // The backend creates the 6 standard lead fields atomically with
      // the form (étape 5), so re-fetch right away to surface them in
      // the builder.
      const { fields: fs } = await api.getFormFields(f.id);
      setFields(fs || []);
      // Open straight into the edit view — there's nothing to preview
      // on a fresh form and the user almost certainly wants to tweak.
      setMode('edit');
      showToast(t('forms.builder.created', 'Formulaire créé'), 'success', 3000);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
    }
  };

  const restoreDefaults = async () => {
    if (!form) return;
    try {
      const r = await wrapSave(() => api.restoreFormDefaults(form.id));
      const { fields: fs } = await api.getFormFields(form.id);
      setFields(fs || []);
      setConfirmRestoreDefaults(false);
      if (r.added > 0) {
        showToast(t('forms.builder.restore_done', { n: r.added, defaultValue: '{{n}} champ(s) ajouté(s)' }), 'success', 3000);
      } else {
        showToast(t('forms.builder.restore_nothing', 'Tous les champs standards sont déjà présents'), 'info', 3000);
      }
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
      setConfirmRestoreDefaults(false);
    }
  };

  const patchForm = async (patch) => {
    if (!form) return;
    const prev = form;
    setForm({ ...form, ...patch });
    try {
      const { form: f } = await wrapSave(() => api.updateForm(form.id, patch));
      setForm(f);
    } catch (err) {
      setForm(prev);
    }
  };

  const togglePublish = () => patchForm({ is_published: !form.is_published });

  const resetForm = async () => {
    if (!form) return;
    try {
      await api.deleteForm(form.id);
      setForm(null);
      setFields([]);
      setConfirmReset(false);
      showToast(t('forms.builder.deleted', 'Formulaire supprimé'), 'success', 3000);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
    }
  };

  // ─── Field actions ───────────────────────────────────────────────
  const saveField = async (payload) => {
    if (!form) return;
    try {
      await wrapSave(async () => {
        if (editingField?.__new) {
          await api.createFormField(form.id, payload);
        } else if (editingField?.id) {
          await api.updateFormField(form.id, editingField.id, payload);
        }
      });
      setEditingField(null);
      const { fields: fs } = await api.getFormFields(form.id);
      setFields(fs || []);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
    }
  };

  const deleteField = async () => {
    if (!form || !confirmDelete) return;
    try {
      await wrapSave(() => api.deleteFormField(form.id, confirmDelete.id));
      setConfirmDelete(null);
      const { fields: fs } = await api.getFormFields(form.id);
      setFields(fs || []);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
    }
  };

  // ↑/↓ reorder within a step. We rebuild the step list, swap, and
  // POST a reorder batch — server is the source of truth for the
  // final order_index values.
  const reorder = async (field, direction) => {
    const stepFields = fields.filter(f => f.step === field.step).sort((a, b) => a.order_index - b.order_index);
    const idx = stepFields.findIndex(f => f.id === field.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= stepFields.length) return;
    const reordered = [...stepFields];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    const items = reordered.map((f, i) => ({ id: f.id, step: f.step, order_index: i }));
    // Optimistic update so the arrow click feels instant.
    setFields(prev => prev.map(f => {
      const r = items.find(it => it.id === f.id);
      return r ? { ...f, order_index: r.order_index } : f;
    }));
    try {
      await wrapSave(() => api.reorderFormFields(form.id, items));
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
      load();
    }
  };

  // ─── Step add/remove ─────────────────────────────────────────────
  const addStep = async () => {
    if (!form) return;
    if ((form.step_count || 3) >= MAX_STEPS) return;
    try {
      const { form: f } = await wrapSave(() => api.addFormStep(form.id));
      setForm(f);
      setActiveStep(f.step_count);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
    }
  };

  // Click on the X icon of a step header. If the step holds fields we
  // intercept with a confirm modal that names how many fields will be
  // moved and where (mirroring the backend's fallback logic).
  const requestRemoveStep = (step) => {
    if (!form || (form.step_count || 3) <= MIN_STEPS) return;
    const count = fields.filter(f => f.step === step).length;
    const target = step === 1 ? 1 : step - 1;
    // Step 1 is the only case where fields move "forward" (to what was
    // step 2 and will renumber down to step 1); for any other step,
    // they move to step-1 which keeps its number. We just surface the
    // resulting *visible* target step number to the user.
    setConfirmRemoveStep({ step, count, target });
  };

  const doRemoveStep = async () => {
    if (!form || !confirmRemoveStep) return;
    const { step } = confirmRemoveStep;
    try {
      const { form: f } = await wrapSave(() => api.removeFormStep(form.id, step));
      setForm(f);
      // Clamp activeStep into the new range so we don't end up on a
      // ghost tab. If the removed step was before the active one, we
      // shift; if it was the active one, we land on the merged target.
      setActiveStep(prev => {
        const newCount = f.step_count;
        if (prev > newCount) return newCount;
        if (prev > step) return prev - 1;
        return prev;
      });
      // Re-fetch fields because the backend renumbered them in a tx.
      const { fields: fs } = await api.getFormFields(form.id);
      setFields(fs || []);
      setConfirmRemoveStep(null);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
      setConfirmRemoveStep(null);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fade-in" style={{ padding: 40, color: '#94a3b8', textAlign: 'center' }}>
        {t('common.loading', 'Chargement…')}
      </div>
    );
  }

  if (!form) return <EmptyState t={t} onCreate={createForm} />;

  const fieldsOfStep = fields
    .filter(f => f.step === activeStep)
    .sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="fade-in">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: '#0f172a', letterSpacing: -0.2 }}>
            {t('forms.builder.title_short', 'Formulaire')}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            {t('forms.builder.subtitle_short', 'Configuration du formulaire de leads')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <SaveIndicator state={saveState} t={t} onRetry={() => setSaveState('idle')} />
          {/* Stats opens a dedicated mode — kept as a button (not a
              tab) per the brief so it sits visually next to the
              publish toggle rather than in the 4-tab strip. */}
          <button
            onClick={() => setMode(mode === 'stats' ? 'preview' : 'stats')}
            style={{
              padding: '6px 14px', borderRadius: 8,
              background: mode === 'stats' ? '#0f172a' : 'transparent',
              border: '0.5px solid ' + (mode === 'stats' ? '#0f172a' : '#e2e8f0'),
              color: mode === 'stats' ? '#fff' : '#475569',
              fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <BarChart2 size={13} /> {t('forms.builder.stats_mode', 'Statistiques')}
          </button>
          {/* Publish toggle replaces the old Publier/Dépublier pair.
              Same visual as the Marketplace publish switch. */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#0f172a' }}>
            <span style={{ fontWeight: 500 }}>{t('forms.builder.publish_label', 'Publier le formulaire')}</span>
            <button onClick={togglePublish} aria-pressed={!!form.is_published}
              style={{
                width: 44, height: 24, borderRadius: 999,
                background: form.is_published ? '#059669' : '#cbd5e1',
                border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
              }}>
              <span style={{
                position: 'absolute', top: 2, left: form.is_published ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </label>
        </div>
      </div>

      {/* ─── Centered tab strip — Marketplace pattern ───────────── */}
      {mode !== 'stats' && (
        <div style={{ display: 'flex', justifyContent: 'center', borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', gap: 28 }}>
            {[
              { id: 'preview',  label: t('forms.builder.tab_preview',  'Aperçu') },
              { id: 'fields',   label: t('forms.builder.tab_fields',   'Champs') },
              { id: 'settings', label: t('forms.builder.tab_settings', 'Paramètres') },
              { id: 'share',    label: t('forms.builder.tab_share',    'Partager') },
            ].map(tab => {
              const active = mode === tab.id;
              return (
                <button key={tab.id} onClick={() => setMode(tab.id)}
                  style={{
                    padding: '10px 4px', background: 'transparent', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 14,
                    fontWeight: active ? 500 : 400,
                    color: active ? '#059669' : '#64748b',
                    borderBottom: '2px solid ' + (active ? '#059669' : 'transparent'),
                    marginBottom: -1,
                  }}>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Status banner replaced by the Publish toggle in the header
          + a soft inline note when in draft mode, shown only on the
          preview tab so it doesn't repeat across every tab. */}
      {mode === 'preview' && !form.is_published && (
        <div style={{ marginBottom: 20, padding: '8px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#a16207', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={12} /> {t('forms.builder.status_draft', 'Brouillon. Le formulaire n\'est pas accessible publiquement.')}
        </div>
      )}

      {mode === 'preview' && (
        <div style={{ position: 'relative', background: '#f8fafc', borderRadius: 16, padding: '32px 16px', border: '1px solid #e2e8f0' }}>
          {/* APERÇU header label + Éditer pill anchored top-right —
              mirrors the Marketplace editor's floating button (same
              padding, radius, font, color #0f6e56). Clicking jumps
              to the Champs tab where the real editing happens. */}
          <button
            onClick={() => setMode('fields')}
            style={{
              position: 'absolute', top: 16, right: 16, zIndex: 5,
              padding: '6px 16px', borderRadius: 999,
              background: '#0f6e56', color: '#fff', border: 'none',
              fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            }}>
            <Pencil size={13} /> {t('forms.builder.edit_mode', 'Éditer')}
          </button>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>
              {t('forms.builder.preview_label', 'Aperçu formulaire')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#0f172a' }}>
              {t('forms.builder.preview_caption', 'Ce que vos partenaires partageront avec leurs visiteurs')}
            </div>
          </div>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <FormPreview form={form} fields={fields} onSubmit={undefined} t={t} />
          </div>
        </div>
      )}

      {mode === 'stats' && (
        <StatsView formId={form.id} t={t} />
      )}

      {mode === 'share' && (
        <ShareModal t={t} form={form} embedded={true} onClose={() => setMode('preview')} />
      )}

      {mode === 'settings' && (
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <SettingsPanel
            form={form} t={t}
            onPatch={patchForm}
            onReset={() => setConfirmReset(true)}
            onRestoreDefaults={() => setConfirmRestoreDefaults(true)}
          />
        </div>
      )}

      {mode === 'fields' && (
      <div>
        {/* ─── Steps + fields ─────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, padding: 4, background: '#f1f5f9', borderRadius: 12, width: 'fit-content', flexWrap: 'wrap' }}>
            {stepsArray(form.step_count).map(s => {
              const active = activeStep === s;
              const count = fields.filter(f => f.step === s).length;
              const canRemove = (form.step_count || 3) > MIN_STEPS;
              return (
                <div key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 6px 4px 12px', borderRadius: 8, background: active ? '#fff' : 'transparent', boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none' }}>
                  <button onClick={() => setActiveStep(s)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: active ? '#0f172a' : '#64748b', fontWeight: active ? 700 : 600, fontSize: 13, padding: '4px 0', fontFamily: 'inherit' }}>
                    {t('forms.builder.step', 'Étape')} {s}/{form.step_count}
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>{count}</span>
                  </button>
                  {canRemove && (
                    <button onClick={() => requestRemoveStep(s)}
                      title={t('forms.builder.remove_step', 'Supprimer cette étape')}
                      style={{ background: 'transparent', border: 'none', borderRadius: 6, padding: 3, cursor: 'pointer', display: 'flex', color: '#94a3b8' }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            {(form.step_count || 3) < MAX_STEPS && (
              <button onClick={addStep}
                title={t('forms.builder.add_step', 'Ajouter une étape')}
                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Plus size={14} /> {t('forms.builder.add_step_short', 'Étape')}
              </button>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 8 }}>
            {fieldsOfStep.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <FileText size={32} style={{ opacity: 0.4 }} />
                <p style={{ margin: '10px 0 0', fontSize: 13 }}>
                  {t('forms.builder.no_fields', 'Aucun champ sur cette étape. Ajoutez le premier ci-dessous.')}
                </p>
              </div>
            ) : (
              fieldsOfStep.map((f, idx) => {
                const meta = TYPE_META[f.type];
                const Icon = meta?.icon || Type;
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: idx < fieldsOfStep.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button onClick={() => reorder(f, -1)} disabled={idx === 0}
                        style={{ background: 'transparent', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', padding: 2, color: idx === 0 ? '#cbd5e1' : '#64748b', display: 'flex' }}>
                        <ArrowUp size={14} />
                      </button>
                      <button onClick={() => reorder(f, 1)} disabled={idx === fieldsOfStep.length - 1}
                        style={{ background: 'transparent', border: 'none', cursor: idx === fieldsOfStep.length - 1 ? 'not-allowed' : 'pointer', padding: 2, color: idx === fieldsOfStep.length - 1 ? '#cbd5e1' : '#64748b', display: 'flex' }}>
                        <ArrowDown size={14} />
                      </button>
                    </div>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: '#eef2ff', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{f.label}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {t('forms.builder.type.' + f.type, f.type)}
                        {f.required ? ' · ' + t('forms.builder.required', 'obligatoire') : ''}
                      </div>
                    </div>
                    <button onClick={() => setEditingField(f)} title={t('common.edit', 'Modifier')}
                      style={{ background: '#fff3cd', color: '#856404', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex' }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDelete(f)} title={t('common.delete', 'Supprimer')}
                      style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
            <button onClick={() => setEditingField({ __new: true, step: activeStep })}
              style={{ width: '100%', padding: '14px', borderRadius: 10, border: '2px dashed #cbd5e1', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: fieldsOfStep.length > 0 ? 8 : 0 }}>
              <Plus size={14} /> {t('forms.builder.add_field', 'Ajouter un champ')}
            </button>
          </div>
        </div>

        {/* Settings moved into its own "Paramètres" tab (rendered
            above when mode === 'settings'). */}
      </div>
      )}

      {/* ─── Modals ────────────────────────────────────────────── */}
      {editingField && (
        <FieldModal
          t={t}
          stepCount={form.step_count || 3}
          initial={editingField.__new ? { step: editingField.step, type: 'text_short', label: '', required: false } : editingField}
          onClose={() => setEditingField(null)}
          onSave={saveField}
        />
      )}
      {/* shareOpen modal kept off — Partager is now a tab. The
          ShareModal component still supports modal mode if a future
          caller needs it. */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title={t('forms.builder.delete_field_title', 'Supprimer ce champ ?')}
        message={
          confirmDelete && STANDARD_ROLES.has(confirmDelete.field_role)
            ? t('forms.builder.delete_standard_warning', { label: confirmDelete.label, defaultValue: '« {{label}} »\n\nCe champ est utilisé pour pré-remplir la fiche prospect dans le pipeline. Si vous le supprimez, ce champ restera vide pour les leads issus de ce formulaire et ne pourra pas être automatiquement mis à jour.\n\nDe plus, ce champ ne sera plus synchronisé avec vos CRM connectés (HubSpot, Salesforce, etc.) pour les leads issus de ce formulaire.' })
            : (confirmDelete ? `« ${confirmDelete.label} »` : '')
        }
        confirmLabel={t('common.delete', 'Supprimer')}
        cancelLabel={t('common.cancel', 'Annuler')}
        variant="danger"
        onConfirm={deleteField}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmModal
        isOpen={confirmRestoreDefaults}
        title={t('forms.builder.restore_title', 'Restaurer les champs par défaut ?')}
        message={t('forms.builder.restore_message', 'Cela va ajouter les champs standards manquants (Prénom, Nom, Email, Téléphone, Société, Poste). Les autres champs ne seront pas modifiés.')}
        confirmLabel={t('forms.builder.restore_confirm', 'Restaurer')}
        cancelLabel={t('common.cancel', 'Annuler')}
        variant="default"
        onConfirm={restoreDefaults}
        onCancel={() => setConfirmRestoreDefaults(false)}
      />
      <ConfirmModal
        isOpen={confirmReset}
        title={t('forms.builder.reset_title', 'Supprimer le formulaire ?')}
        message={t('forms.builder.reset_message', 'Tous les champs et liens partenaires seront archivés. Vous pourrez créer un nouveau formulaire ensuite.')}
        confirmLabel={t('common.delete', 'Supprimer')}
        cancelLabel={t('common.cancel', 'Annuler')}
        variant="danger"
        onConfirm={resetForm}
        onCancel={() => setConfirmReset(false)}
      />
      <ConfirmModal
        isOpen={!!confirmRemoveStep}
        title={t('forms.builder.remove_step_title', 'Supprimer cette étape ?')}
        message={confirmRemoveStep ? (
          confirmRemoveStep.count === 0
            ? t('forms.builder.remove_step_empty', 'Cette étape est vide.')
            : t('forms.builder.remove_step_with_fields', { n: confirmRemoveStep.count, target: confirmRemoveStep.target, defaultValue: '{{n}} champ(s) seront déplacés vers l\'étape {{target}}.' })
        ) : ''}
        confirmLabel={t('common.delete', 'Supprimer')}
        cancelLabel={t('common.cancel', 'Annuler')}
        variant="danger"
        onConfirm={doRemoveStep}
        onCancel={() => setConfirmRemoveStep(null)}
      />
    </div>
  );
}

// ─── Save indicator ───────────────────────────────────────────────
// Three-state pill rendered next to the mode toggle:
//   idle    → nothing (no DOM cost, no visual noise on a clean form)
//   saving  → gray spinner + "Sauvegarde…"
//   saved   → green check + "Enregistré" (auto-fades after 2s upstream)
//   error   → red alert + "Erreur, réessayez" (click = clear state,
//             user can re-trigger the action manually)
// Spinner uses a one-shot keyframe injected via a <style> tag so we
// don't depend on global CSS being loaded.
function SaveIndicator({ state, t, onRetry }) {
  if (state === 'idle') return null;
  const cfg = state === 'saving'
    ? { bg: '#f1f5f9', fg: '#64748b', icon: <Loader2 size={12} className="rb-spin" />, text: t('forms.builder.saving', 'Sauvegarde…') }
    : state === 'saved'
      ? { bg: '#f0fdf4', fg: '#15803d', icon: <Check size={12} />, text: t('forms.builder.saved', 'Enregistré') }
      : { bg: '#fef2f2', fg: '#dc2626', icon: <AlertTriangle size={12} />, text: t('forms.builder.save_error', 'Erreur, réessayez') };
  return (
    <>
      <style>{`@keyframes rb-spin { to { transform: rotate(360deg); } } .rb-spin { animation: rb-spin 1s linear infinite; }`}</style>
      <span
        onClick={state === 'error' ? onRetry : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: cfg.bg, color: cfg.fg, fontSize: 12, fontWeight: 500,
          cursor: state === 'error' ? 'pointer' : 'default',
          transition: 'opacity 0.3s',
        }}
      >
        {cfg.icon}
        {cfg.text}
      </span>
    </>
  );
}

// ─── Stats view ────────────────────────────────────────────────────
// Third builder mode: pulls /api/forms/:id/stats and renders KPIs +
// funnel bars + top abandoned fields. Period & partner_id filters
// are state-only (no URL sync — refreshing the page resets to the
// 30d default like the rest of the builder modes).
function StatsView({ formId, t }) {
  const [period, setPeriod] = useState('30d');
  const [partnerId, setPartnerId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getFormStats(formId, { period, partner_id: partnerId || null })
      .then(d => setData(d))
      .catch(err => { setData(null); showToast(err.message || 'Erreur', 'error', 4000); })
      .finally(() => setLoading(false));
  }, [formId, period, partnerId]);

  const k = data?.kpis || { views: 0, starts: 0, submissions: 0, conversion_rate: 0 };
  const funnel = data?.funnel || [];
  const abandons = data?.top_abandons || [];
  const partners = data?.partners || [];
  const maxFunnel = Math.max(1, ...funnel.map(f => f.count));
  const fmtPct = (n) => Math.round((n || 0) * 100) + ' %';

  const PERIODS = [
    { val: '7d',  label: t('forms.stats.period_7d',  '7 j') },
    { val: '30d', label: t('forms.stats.period_30d', '30 j') },
    { val: '90d', label: t('forms.stats.period_90d', '90 j') },
    { val: 'all', label: t('forms.stats.period_all', 'Tout') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', padding: 3, background: '#f1f5f9', borderRadius: 8 }}>
          {PERIODS.map(p => {
            const active = period === p.val;
            return (
              <button key={p.val} onClick={() => setPeriod(p.val)}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? '#0f172a' : '#64748b', fontWeight: 500, fontSize: 12, boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none', fontFamily: 'inherit' }}>
                {p.label}
              </button>
            );
          })}
        </div>
        {partners.length > 0 && (
          <select value={partnerId} onChange={e => setPartnerId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, background: '#fff', color: '#0f172a', cursor: 'pointer', fontFamily: 'inherit' }}>
            <option value="">{t('forms.stats.all_partners', 'Tous les partenaires')}</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {loading && !data && (
        <div style={{ padding: 40, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>{t('common.loading', 'Chargement…')}</div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <StatCard label={t('forms.stats.kpi_views', 'Vues')} value={k.views} />
            <StatCard label={t('forms.stats.kpi_submissions', 'Soumissions')} value={k.submissions} accent />
            <StatCard label={t('forms.stats.kpi_conversion', 'Conversion globale')} value={fmtPct(k.conversion_rate)} />
          </div>

          {/* Funnel — bars are 100%-relative to the max step count so
              the shape stays readable even with low absolute traffic. */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{t('forms.stats.funnel_title', 'Funnel')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {funnel.map((row, i) => {
                const w = Math.round((row.count / maxFunnel) * 100);
                return (
                  <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 110, fontSize: 12, color: '#64748b' }}>{row.label}</div>
                    <div style={{ flex: 1, height: 28, position: 'relative', background: '#f8fafc', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, width: w + '%', background: i === funnel.length - 1 ? '#059669' : '#6366f1', opacity: 0.85, borderRadius: 6, transition: 'width 0.3s' }} />
                      <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', color: w > 30 ? '#fff' : '#0f172a', fontSize: 12, fontWeight: 600 }}>
                        <span>{row.count}</span>
                        {row.rate_from_prev != null && i > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>{fmtPct(row.rate_from_prev)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top abandoned fields */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{t('forms.stats.abandons_title', 'Top des champs abandonnés')}</h3>
            {abandons.length === 0 ? (
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>{t('forms.stats.abandons_empty', 'Aucun champ abandonné sur la période.')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {abandons.map((a, i) => (
                  <div key={a.field_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9' }}>
                    <span style={{ color: '#0f172a', fontSize: 13 }}>{a.label}</span>
                    <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}>{a.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 18px' }}>
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent ? '#059669' : '#0f172a', marginTop: 6, letterSpacing: -0.5 }}>{value}</div>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────
function EmptyState({ t, onCreate }) {
  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: '60px auto 0', textAlign: 'center', padding: 40 }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: '#eef2ff', color: '#6366f1', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FileText size={28} />
      </div>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: -0.4 }}>
        {t('forms.empty.title', 'Créez votre formulaire d\'inscription')}
      </h1>
      <p style={{ margin: '10px 0 24px', color: '#64748b', fontSize: 14 }}>
        {t('forms.empty.subtitle', 'Un formulaire en 3 étapes que vos partenaires partageront sur leur site pour recruter des leads attribués automatiquement.')}
      </p>
      <button onClick={onCreate}
        style={{ padding: '12px 24px', borderRadius: 12, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Plus size={16} /> {t('forms.empty.cta', 'Créer le formulaire')}
      </button>
    </div>
  );
}

// ─── Settings side panel ───────────────────────────────────────────
// IMPORTANT: SettingsField is intentionally declared at *module* scope.
// Putting it inside SettingsPanel makes React see a fresh component
// type every render, which unmounts every <input> wrapped by it on
// each keystroke (focus loss bug). Same reason inputStyle lives here.
const SETTINGS_INPUT_STYLE = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };

function SettingsField({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

function SettingsPanel({ form, t, onPatch, onReset, onRestoreDefaults }) {
  // Local-edit state for title/description/thank_you/appointment_url
  // so the user can type without firing a PATCH on every keystroke.
  // 600ms debounce autosaves after the last change; blur still
  // commits eagerly to flush before the user navigates away.
  const [local, setLocal] = useState({
    title: form.title || '',
    description: form.description || '',
    thank_you_message: form.thank_you_message || '',
    appointment_url: form.appointment_url || '',
  });
  useEffect(() => {
    setLocal({
      title: form.title || '',
      description: form.description || '',
      thank_you_message: form.thank_you_message || '',
      appointment_url: form.appointment_url || '',
    });
  }, [form.id]);

  const commit = (key) => {
    if (local[key] !== (form[key] || '')) onPatch({ [key]: local[key] });
  };

  // Debounced autosave. One shared timer for the panel — keystrokes
  // on any field reset it. Closure pitfall: we capture `local` at
  // setTimeout creation, so we read fresh values via the functional
  // pattern below.
  const debounceTimer = useRef(null);
  const scheduleSave = (nextLocal) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const diff = {};
      for (const k of ['title', 'description', 'thank_you_message', 'appointment_url']) {
        if ((nextLocal[k] || '') !== (form[k] || '')) diff[k] = nextLocal[k];
      }
      if (Object.keys(diff).length) onPatch(diff);
    }, 600);
  };
  // Clear the pending timer on unmount so a half-typed value doesn't
  // PATCH after the user navigates away from /forms.
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, position: 'sticky', top: 16 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
        {t('forms.builder.settings', 'Paramètres')}
      </h3>
      <SettingsField label={t('forms.builder.field_title', 'Titre')}>
        <input type="text" value={local.title}
          onChange={e => { const v = e.target.value; setLocal(s => { const n = { ...s, title: v }; scheduleSave(n); return n; }); }}
          onBlur={() => commit('title')}
          style={SETTINGS_INPUT_STYLE} />
      </SettingsField>
      <SettingsField label={t('forms.builder.field_description', 'Description (optionnelle)')}>
        <textarea rows={3} value={local.description}
          onChange={e => { const v = e.target.value; setLocal(s => { const n = { ...s, description: v }; scheduleSave(n); return n; }); }}
          onBlur={() => commit('description')}
          style={{ ...SETTINGS_INPUT_STYLE, resize: 'vertical' }} />
      </SettingsField>
      <SettingsField label={t('forms.builder.field_thank_you', 'Message de remerciement')}>
        <textarea rows={3} value={local.thank_you_message}
          onChange={e => { const v = e.target.value; setLocal(s => { const n = { ...s, thank_you_message: v }; scheduleSave(n); return n; }); }}
          onBlur={() => commit('thank_you_message')}
          placeholder={t('forms.builder.thank_you_ph', 'Merci ! Nous vous recontactons sous 24h.')}
          style={{ ...SETTINGS_INPUT_STYLE, resize: 'vertical' }} />
      </SettingsField>
      <SettingsField label={t('forms.builder.field_lead_handling', 'Destination des leads')}>
        {[
          { val: 'partner_managed', label: t('forms.builder.lh_partner_managed', 'Partenaire direct'),
            sub: t('forms.builder.lh_partner_managed_sub', 'Le partenaire gère le deal') },
          { val: 'client_prospect', label: t('forms.builder.lh_client_prospect', 'Équipe commerciale'),
            sub: t('forms.builder.lh_client_prospect_sub', 'Votre équipe reprend le lead') },
        ].map(opt => {
          const active = form.default_lead_handling === opt.val;
          return (
            <button key={opt.val} type="button" onClick={() => onPatch({ default_lead_handling: opt.val })}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: active ? '2px solid var(--rb-primary, #059669)' : '1.5px solid #e2e8f0', background: active ? '#f0fdf4' : '#fff', marginBottom: 6, cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{opt.sub}</div>
            </button>
          );
        })}
      </SettingsField>

      {/* Appointment moved here from "yet another field type" in v50.
          The toggle flips forms.appointment_enabled; the URL input
          drives forms.appointment_url. The public page embeds the
          iframe under the thank-you message when both are set. */}
      <SettingsField label={t('forms.builder.appointment_section', 'Rendez-vous')}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', marginBottom: form.appointment_enabled ? 8 : 0 }}>
          <input type="checkbox" checked={!!form.appointment_enabled}
            onChange={e => onPatch({ appointment_enabled: e.target.checked })}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>
            {t('forms.builder.appointment_toggle', 'Proposer un rendez-vous après soumission')}
          </span>
        </label>
        {form.appointment_enabled && (
          <input type="url" value={local.appointment_url}
            onChange={e => { const v = e.target.value; setLocal(s => { const n = { ...s, appointment_url: v }; scheduleSave(n); return n; }); }}
            onBlur={() => commit('appointment_url')}
            placeholder={t('forms.builder.appointment_url_ph', 'https://calendly.com/…')}
            style={{ ...SETTINGS_INPUT_STYLE, marginTop: 6 }} />
        )}
      </SettingsField>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        {onRestoreDefaults && (
          <button onClick={onRestoreDefaults}
            style={{ background: 'transparent', border: 'none', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={12} /> {t('forms.builder.restore', 'Restaurer les champs par défaut')}
          </button>
        )}
        <button onClick={onReset}
          style={{ background: 'transparent', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Trash2 size={12} /> {t('forms.builder.reset', 'Supprimer le formulaire')}
        </button>
      </div>
    </div>
  );
}

// ─── Field modal (create/edit) ─────────────────────────────────────
function FieldModal({ t, initial, onClose, onSave, stepCount = 3 }) {
  const [type, setType] = useState(initial.type || 'text_short');
  const [label, setLabel] = useState(initial.label || '');
  const [placeholder, setPlaceholder] = useState(initial.placeholder || '');
  const [required, setRequired] = useState(!!initial.required);
  const [step, setStep] = useState(initial.step || 1);
  // options stored locally as a newline-separated string for the
  // textarea; we split + trim on save.
  const [optionsText, setOptionsText] = useState(
    Array.isArray(initial.options) ? initial.options.join('\n') : ''
  );
  const [saving, setSaving] = useState(false);

  const meta = TYPE_META[type];

  const handleSave = async () => {
    if (!label.trim()) { showToast(t('forms.builder.label_required', 'Libellé requis'), 'error', 3000); return; }
    setSaving(true);
    const payload = {
      type, label: label.trim(), placeholder: placeholder.trim() || null,
      required: !!required, step: Number(step),
    };
    if (meta && meta.hasOptions) {
      const opts = optionsText.split('\n').map(s => s.trim()).filter(Boolean);
      if (!opts.length) { showToast(t('forms.builder.options_required', 'Au moins une option requise'), 'error', 3000); setSaving(false); return; }
      payload.options = opts;
    }
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, color: '#0f172a', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 20, padding: 28, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
            {initial.__new ? t('forms.builder.add_field_title', 'Ajouter un champ') : t('forms.builder.edit_field_title', 'Modifier le champ')}
          </h3>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
            <X size={16} color="#64748b" />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('forms.builder.type_label', 'Type de champ')}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
            {FIELD_TYPES.map(ft => {
              const active = type === ft.key;
              const Icon = ft.icon;
              return (
                <button key={ft.key} type="button" onClick={() => setType(ft.key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: active ? '2px solid var(--rb-primary, #059669)' : '1.5px solid #e2e8f0', background: active ? '#f0fdf4' : '#fff', cursor: 'pointer', fontSize: 12, color: '#0f172a', fontWeight: active ? 700 : 500, textAlign: 'left' }}>
                  <Icon size={13} />
                  {t('forms.builder.type.' + ft.key, ft.key)}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('forms.builder.label', 'Libellé')}
          </label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder={t('forms.builder.label_ph', 'Ex: Quel est votre besoin ?')}
            style={inputStyle} autoFocus />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('forms.builder.placeholder_label', 'Placeholder (optionnel)')}
          </label>
          <input type="text" value={placeholder} onChange={e => setPlaceholder(e.target.value)}
            style={inputStyle} />
        </div>

        {meta && meta.hasOptions && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('forms.builder.options_label', 'Options (une par ligne)')}
            </label>
            <textarea rows={4} value={optionsText} onChange={e => setOptionsText(e.target.value)}
              placeholder={t('forms.builder.options_ph', 'Option 1\nOption 2\nOption 3')}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#334155' }}>
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
            {t('forms.builder.required_label', 'Champ obligatoire')}
          </label>
          <div style={{ flex: 1, minWidth: 140, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t('forms.builder.step', 'Étape')}</span>
            <select value={step} onChange={e => setStep(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, background: '#fff', cursor: 'pointer' }}>
              {stepsArray(stepCount).map(s => <option key={s} value={s}>{s}/{stepCount}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {t('common.cancel', 'Annuler')}
          </button>
          <button onClick={handleSave} disabled={saving || !label.trim()}
            style={{ padding: '10px 22px', borderRadius: 10, background: !label.trim() ? '#e2e8f0' : 'var(--rb-primary, #059669)', color: !label.trim() ? '#94a3b8' : '#fff', border: 'none', cursor: !label.trim() ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
            {saving ? t('common.saving', 'Enregistrement…') : t('common.save', 'Enregistrer')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Share modal ───────────────────────────────────────────────────
// Used both as a floating modal (legacy callers) and inline inside
// the Partager tab. When `embedded` is true we drop the fixed-position
// overlay + close button — the tab strip handles navigation away.
function ShareModal({ t, form, onClose, embedded = false }) {
  const [partners, setPartners] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  // Client-side search + pagination. Partners list is small (capped
  // at 1000) so we don't need a server-side trip; filter in memory
  // and slice. 10 rows / page matches the brief.
  const SHARE_PAGE_SIZE = 10;
  const [shareQuery, setShareQuery] = useState('');
  const [sharePage, setSharePage] = useState(1);
  useEffect(() => { setSharePage(1); }, [shareQuery]);
  const filteredPartners = useMemo(() => {
    const q = shareQuery.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    );
  }, [partners, shareQuery]);
  const pagedPartners = useMemo(() => {
    const start = (sharePage - 1) * SHARE_PAGE_SIZE;
    return filteredPartners.slice(start, start + SHARE_PAGE_SIZE);
  }, [filteredPartners, sharePage]);

  const load = async () => {
    try {
      const [{ partners: ps }, { tokens: ts }] = await Promise.all([
        api.getPartners(),
        api.getFormPartnerTokens(form.id),
      ]);
      // Active partners only — the share-link UI is forward-looking,
      // archived partners don't need new tokens.
      setPartners((ps || []).filter(p => p.is_active));
      setTokens(ts || []);
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const tokenByPartner = useMemo(() => {
    const m = {};
    for (const tk of tokens) m[tk.partner_id] = tk;
    return m;
  }, [tokens]);

  const generate = async (partnerId) => {
    try {
      const { token } = await api.createFormPartnerToken(form.id, partnerId);
      setTokens(prev => [token, ...prev]);
    } catch (err) {
      if (err.data?.token) {
        // Already exists — surface it.
        setTokens(prev => prev.find(t => t.id === err.data.token.id) ? prev : [err.data.token, ...prev]);
      } else {
        showToast(err.message || 'Erreur', 'error', 4000);
      }
    }
  };

  const revoke = async (tokenId) => {
    try {
      await api.deleteFormPartnerToken(form.id, tokenId);
      setTokens(prev => prev.filter(t => t.id !== tokenId));
    } catch (err) {
      showToast(err.message || 'Erreur', 'error', 4000);
    }
  };

  const copy = (url, id) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  // The body is identical for both modes; the wrapper differs.
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
            {t('forms.share.title', 'Partager le formulaire')}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            {t('forms.share.subtitle', 'Générez un lien unique par partenaire. Chaque soumission sera attribuée automatiquement.')}
          </p>
        </div>
        {!embedded && (
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
            <X size={16} color="#64748b" />
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          {t('common.loading', 'Chargement…')}
        </div>
      ) : partners.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          {t('forms.share.no_partners', 'Aucun partenaire actif à inviter.')}
        </div>
      ) : (
        <>
          {/* Search + total counter row. Search filters in-memory
              against name + email; counter reflects the filtered set
              so the user knows how many rows their query matched. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <input
                type="search"
                value={shareQuery}
                onChange={e => setShareQuery(e.target.value)}
                placeholder={t('forms.share.search_placeholder', 'Rechercher un partenaire (nom, email)…')}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a',
                  fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
              {t('forms.share.count', { count: filteredPartners.length, defaultValue: '{{count}} partenaires' })}
            </span>
          </div>

          {filteredPartners.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {t('forms.share.no_match', 'Aucun partenaire trouvé')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pagedPartners.map(p => {
              const tk = tokenByPartner[p.id];
              const url = tk ? publicFormUrl(form.id, tk.token) : '';
              return (
                <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{p.email}</div>
                    </div>
                    {tk ? (
                      <button onClick={() => revoke(tk.id)}
                        style={{ padding: '7px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                        {t('forms.share.revoke', 'Révoquer')}
                      </button>
                    ) : (
                      <button onClick={() => generate(p.id)}
                        style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Link2 size={12} /> {t('forms.share.generate', 'Générer un lien')}
                      </button>
                    )}
                  </div>
                  {tk && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ flex: 1, fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</code>
                      <button onClick={() => copy(url, tk.id)}
                        style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 9px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#475569', fontWeight: 600 }}>
                        {copiedId === tk.id ? <><Check size={11} color="#059669" /> {t('common.copied', 'Copié')}</> : <><Copy size={11} /> {t('common.copy', 'Copier')}</>}
                      </button>
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
          {filteredPartners.length > SHARE_PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <Pagination
                currentPage={sharePage}
                totalPages={Math.ceil(filteredPartners.length / SHARE_PAGE_SIZE)}
                onPageChange={setSharePage}
              />
            </div>
          )}
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 28 }}>
        {body}
      </div>
    );
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 20, padding: 28, width: 640, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        {body}
      </div>
    </div>
  );
}
