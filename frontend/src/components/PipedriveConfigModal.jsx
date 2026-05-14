import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X as XIcon, Info } from 'lucide-react';
import api from '../lib/api';
import { showToast, showConfirm } from './Dialogs.jsx';
import FieldCombobox from './FieldCombobox.jsx';

// ─── Domain constants — mirrors backend pipedriveService.js ─────────
// CANONICAL_STATUSES is the full RefBoost status set; STAGE_MAPPABLE
// is the subset that's routable to a Pipedrive stage. 'won' and 'lost'
// live in Pipedrive's `status` field (open/won/lost/deleted) — never
// as stages — so the UI doesn't render rows for them and the backend
// strips them silently if a stale client posts them.
const CANONICAL_STATUSES = ['new', 'contacted', 'qualified', 'meeting', 'proposal', 'won', 'lost'];
const STAGE_MAPPABLE_STATUSES = ['new', 'contacted', 'qualified', 'meeting', 'proposal'];

// Each entity tab lists which RefBoost fields are allowed to map to a
// Pipedrive {entity} field. The backend whitelist is broader; we
// expose only the subset that makes semantic sense per entity.
//
// Person uses contact_first_name + contact_last_name (separate
// referrals columns since v18d) rather than prospect_name — Pipedrive
// Person has first_name / last_name fields natively, so the natural
// mapping is field-to-field. prospect_name stays on Deal (it's the
// deal/company header, not a personal name).
const REFBOOST_FIELDS_BY_ENTITY = {
  deal:         ['prospect_name', 'mrr', 'notes'],
  person:       ['contact_first_name', 'contact_last_name', 'email', 'phone', 'role'],
  organization: ['company'],
};

const STATUS_LABEL_KEYS = {
  new:        'referral_status.new',
  contacted:  'referral_status.contacted',
  qualified:  'referral_status.qualified',
  meeting:    'referral_status.meeting',
  proposal:   'referral_status.proposal',
  won:        'referral_status.won',
  lost:       'referral_status.lost',
};

const FIELD_LABEL_KEYS = {
  prospect_name:      'pipedrive.field_prospect_name',
  contact_first_name: 'pipedrive.field_contact_first_name',
  contact_last_name:  'pipedrive.field_contact_last_name',
  email:              'pipedrive.field_email',
  phone:              'pipedrive.field_phone',
  company:            'pipedrive.field_company',
  notes:              'pipedrive.field_notes',
  mrr:                'pipedrive.field_mrr',
  partner_name:       'pipedrive.field_partner_name',
  role:               'pipedrive.field_role',
};

// Status fallback labels used when the project doesn't carry a
// referral_status.<slug> i18n key (defensive — most repos do).
const STATUS_FALLBACK = {
  new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié',
  meeting: 'Rendez-vous', proposal: 'Proposition',
  won: 'Gagné', lost: 'Perdu',
};

const FIELD_FALLBACK = {
  prospect_name: 'Nom du prospect',
  contact_first_name: 'Prénom du prospect',
  contact_last_name: 'Nom du prospect',
  email: 'Email',
  phone: 'Téléphone',
  company: 'Entreprise',
  notes: 'Notes',
  mrr: 'MRR / Valeur du deal',
  partner_name: 'Nom du partenaire',
  role: 'Rôle / Poste',
};

// ─── Shared styles (kept inline to match the rest of the codebase) ──
const btnSecondary = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
  background: '#fff', color: '#0f172a', fontWeight: 500, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
};
const btnPrimary = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: '#059669', color: '#fff', fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
};
const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit',
  boxSizing: 'border-box', background: '#fff',
};

export default function PipedriveConfigModal({ onClose }) {
  const { t } = useTranslation();

  // ─── Loading state ────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── Domain state ─────────────────────────────────────────────────
  const [pipelines, setPipelines] = useState([]);
  const [stages, setStages] = useState([]);   // for the active pipeline
  const [stagesLoading, setStagesLoading] = useState(false);
  const [fields, setFields] = useState({ deal: [], person: [], organization: [] });
  // selectedPipelineId stored as string so the <select> compare stays
  // sane (HTML form values are always strings).
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  // stageMap[status] = stage id (string) | ''
  const [stageMap, setStageMap] = useState(() =>
    Object.fromEntries(CANONICAL_STATUSES.map(s => [s, '']))
  );
  // fieldMap[entity][refboost_field] = pipedrive key (string) | ''
  const [fieldMap, setFieldMap] = useState({
    deal:         Object.fromEntries(REFBOOST_FIELDS_BY_ENTITY.deal.map(f => [f, ''])),
    person:       Object.fromEntries(REFBOOST_FIELDS_BY_ENTITY.person.map(f => [f, ''])),
    organization: Object.fromEntries(REFBOOST_FIELDS_BY_ENTITY.organization.map(f => [f, ''])),
  });
  const [autoPush, setAutoPush] = useState(false);

  const [activeTab, setActiveTab] = useState('statuses');

  // dirty tracking — compared against a snapshot taken at load time so
  // closing the modal without unsaved changes is a no-prompt path.
  const initialSnapshot = useRef(null);
  const isDirty = () => {
    if (!initialSnapshot.current) return false;
    const cur = JSON.stringify({ selectedPipelineId, stageMap, fieldMap, autoPush });
    return cur !== initialSnapshot.current;
  };

  // ─── Bootstrap: load pipelines, settings, mappings in parallel ────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [pipelinesResp, statusResp, mappingsResp] = await Promise.all([
          api.getPipedrivePipelines().catch(e => ({ error: e })),
          api.getPipedriveStatus().catch(e => ({ error: e })),
          api.getPipedriveMappings().catch(e => ({ error: e })),
        ]);
        if (cancelled) return;
        if (pipelinesResp && pipelinesResp.error) {
          throw new Error(pipelinesResp.error.message || 'pipelines_failed');
        }
        const pList = Array.isArray(pipelinesResp?.pipelines) ? pipelinesResp.pipelines : [];
        setPipelines(pList);

        // Resolve which pipeline to pre-select. Settings.pipeline_id is
        // the authoritative source; fall back to the Pipedrive default
        // pipeline if not yet configured.
        const settingsPipeline = statusResp?.pipeline_id || null;
        const defaultPipeline = pList.find(p => p.is_default) || pList[0] || null;
        const initialPipelineId = settingsPipeline != null
          ? String(settingsPipeline)
          : (defaultPipeline ? String(defaultPipeline.id) : '');
        setSelectedPipelineId(initialPipelineId);
        setAutoPush(!!statusResp?.auto_push);

        // Pre-fill the stage map from existing crm_stage_mappings.
        // Only stage-mappable statuses survive — backend already
        // filters won/lost on read, this is belt-and-suspenders.
        const incomingStageMap = Object.fromEntries(CANONICAL_STATUSES.map(s => [s, '']));
        for (const m of mappingsResp?.stage_mappings || []) {
          if (STAGE_MAPPABLE_STATUSES.includes(m.refboost_status)) {
            incomingStageMap[m.refboost_status] = String(m.crm_stage || '');
          }
        }
        setStageMap(incomingStageMap);

        // Pre-fill the field map from existing crm_field_mappings.
        const initialFieldMap = {
          deal:         Object.fromEntries(REFBOOST_FIELDS_BY_ENTITY.deal.map(f => [f, ''])),
          person:       Object.fromEntries(REFBOOST_FIELDS_BY_ENTITY.person.map(f => [f, ''])),
          organization: Object.fromEntries(REFBOOST_FIELDS_BY_ENTITY.organization.map(f => [f, ''])),
        };
        for (const entity of ['deal', 'person', 'organization']) {
          for (const m of (mappingsResp?.field_mappings?.[entity] || [])) {
            if (initialFieldMap[entity] && Object.prototype.hasOwnProperty.call(initialFieldMap[entity], m.refboost_field)) {
              initialFieldMap[entity][m.refboost_field] = String(m.crm_field || '');
            }
          }
        }
        setFieldMap(initialFieldMap);

        // Snapshot for dirty detection — taken AFTER state is populated
        // so the first compare round-trips clean.
        initialSnapshot.current = JSON.stringify({
          selectedPipelineId: initialPipelineId,
          stageMap: incomingStageMap,
          fieldMap: initialFieldMap,
          autoPush: !!statusResp?.auto_push,
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message || 'load_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Pipeline change → refresh stages + (best-effort) field lists ──
  // Stages depend on the selected pipeline, fields don't — but we lazy-
  // load fields on first tab visit so the initial paint stays fast.
  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      return;
    }
    let cancelled = false;
    setStagesLoading(true);
    api.getPipedriveStages(selectedPipelineId)
      .then(r => { if (!cancelled) setStages(r.stages || []); })
      .catch(e => {
        if (cancelled) return;
        console.error('[pipedrive.stages]', e);
        setStages([]);
      })
      .finally(() => { if (!cancelled) setStagesLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPipelineId]);

  // Lazy-load fields for an entity when the tab is first opened. We
  // capture per-entity errors so the tab can show a precise reason
  // (missing scope, not connected, etc.) instead of an empty list.
  const fieldsLoadedRef = useRef(new Set());
  const [fieldsError, setFieldsError] = useState({ deal: null, person: null, organization: null });
  useEffect(() => {
    if (activeTab === 'statuses') return;
    const entity = activeTab; // 'deal' | 'person' | 'organization'
    if (fieldsLoadedRef.current.has(entity)) return;
    fieldsLoadedRef.current.add(entity);
    setFieldsError(prev => ({ ...prev, [entity]: null }));
    api.getPipedriveFields(entity)
      .then(r => {
        const list = r.fields || [];
        setFields(prev => ({ ...prev, [entity]: list }));
        // Default mapping for Organization: when no "company" mapping
        // is set yet and Pipedrive's standard "name" field exists,
        // pre-select it. This is the universally-expected pairing —
        // the admin can still override it via the combobox. Done in
        // the load callback so the suggestion shows up the first time
        // the tab is opened, never overwriting an existing choice.
        if (entity === 'organization') {
          setFieldMap(prev => {
            if (prev.organization?.company) return prev;
            const hasName = list.some(f => f.key === 'name');
            if (!hasName) return prev;
            return {
              ...prev,
              organization: { ...prev.organization, company: 'name' },
            };
          });
        }
      })
      .catch(e => {
        console.error('[pipedrive.fields]', entity, e);
        // Keep the slot in the "loaded" set so the user can re-open
        // the tab without a re-fetch storm; clear it to allow manual
        // retry via the inline retry button rendered below.
        fieldsLoadedRef.current.delete(entity);
        const code = e?.data?.error || '';
        const detail = e?.data?.detail || e?.message || '';
        setFieldsError(prev => ({ ...prev, [entity]: { code, detail } }));
      });
  }, [activeTab]);

  const retryFields = (entity) => {
    fieldsLoadedRef.current.delete(entity);
    setFieldsError(prev => ({ ...prev, [entity]: null }));
    // Trigger the effect by toggling the active tab off and back on
    // is overkill; just refetch inline.
    api.getPipedriveFields(entity)
      .then(r => {
        setFields(prev => ({ ...prev, [entity]: r.fields || [] }));
        fieldsLoadedRef.current.add(entity);
      })
      .catch(e => {
        const code = e?.data?.error || '';
        const detail = e?.data?.detail || e?.message || '';
        setFieldsError(prev => ({ ...prev, [entity]: { code, detail } }));
      });
  };

  // ─── Pipeline change with prior mappings → warn + reset ───────────
  // Stage IDs are scoped to a single pipeline in Pipedrive, so when
  // the admin switches to a different pipeline the stage mappings
  // become meaningless. We warn before applying.
  const onPipelineChange = async (newId) => {
    if (newId === selectedPipelineId) return;
    const hasMappings = Object.values(stageMap).some(v => v);
    if (hasMappings) {
      const ok = await showConfirm({
        title: t('pipedrive.pipeline_change_title', 'Changer de pipeline'),
        message: t('pipedrive.pipeline_change_msg', 'Les mappings de statuts vont être réinitialisés car les stages appartiennent au pipeline précédent. Confirmer ?'),
        variant: 'warning',
      });
      if (!ok) return;
    }
    setSelectedPipelineId(newId);
    setStageMap(Object.fromEntries(CANONICAL_STATUSES.map(s => [s, ''])));
  };

  // ─── Save ─────────────────────────────────────────────────────────
  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Stage mappings: only persist non-empty entries, scoped to the
      // stage-mappable subset (won/lost are routed through Pipedrive's
      // deal status field, not a stage — handled at push time in P3).
      const stage_mappings = STAGE_MAPPABLE_STATUSES
        .filter(s => stageMap[s])
        .map(s => ({
          refboost_status: s,
          crm_stage: stageMap[s],
          crm_pipeline_id: selectedPipelineId || null,
        }));
      // Field mappings: only non-empty.
      const field_mappings = {
        deal:         Object.entries(fieldMap.deal).filter(([, v]) => v).map(([k, v]) => ({ refboost_field: k, crm_field: v })),
        person:       Object.entries(fieldMap.person).filter(([, v]) => v).map(([k, v]) => ({ refboost_field: k, crm_field: v })),
        organization: Object.entries(fieldMap.organization).filter(([, v]) => v).map(([k, v]) => ({ refboost_field: k, crm_field: v })),
      };
      await Promise.all([
        api.savePipedriveSettings({ pipeline_id: selectedPipelineId ? parseInt(selectedPipelineId, 10) : null, auto_push: !!autoPush }),
        api.savePipedriveMappings({ stage_mappings, field_mappings }),
      ]);
      // Refresh the snapshot so subsequent close → no prompt.
      initialSnapshot.current = JSON.stringify({ selectedPipelineId, stageMap, fieldMap, autoPush });
      showToast(t('pipedrive.save_success', 'Configuration Pipedrive enregistrée'), 'success');
      onClose();
    } catch (err) {
      showToast(err.message || t('pipedrive.save_error', 'Erreur lors de l\'enregistrement'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onClickClose = async () => {
    if (isDirty()) {
      const ok = await showConfirm({
        title: t('pipedrive.unsaved_changes_title', 'Modifications non sauvegardées'),
        message: t('pipedrive.unsaved_changes_confirm', 'Vous avez des modifications non sauvegardées. Voulez-vous vraiment fermer ?'),
        variant: 'warning',
      });
      if (!ok) return;
    }
    onClose();
  };

  // ─── Validation banners ───────────────────────────────────────────
  // won/lost are intentionally NOT in the "incomplete mapping" check
  // — they're status-overridden in Pipedrive (see the info block in
  // the Statuses tab).
  const banners = useMemo(() => {
    const out = [];
    if (!selectedPipelineId) {
      out.push({ tone: 'warning', text: t('pipedrive.warning_no_pipeline', 'Sélectionnez un pipeline pour activer la synchronisation') });
    }
    if (pipelines.length === 0 && !loading && !loadError) {
      out.push({ tone: 'info', text: t('pipedrive.no_pipelines', 'Aucun pipeline trouvé. Créez un pipeline dans Pipedrive avant de configurer la synchronisation.') });
    }
    return out;
  }, [selectedPipelineId, pipelines.length, loading, loadError, t]);

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div
      onClick={onClickClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 760, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(15,23,42,0.25)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '20px 24px 12px', borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {t('pipedrive.configure_title', 'Configurer Pipedrive')}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              {t('pipedrive.configure_subtitle', 'Synchronisez vos referrals et partenaires avec votre pipeline')}
            </p>
          </div>
          <button
            type="button" onClick={onClickClose}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {t('common.loading', 'Chargement…')}
            </div>
          )}

          {!loading && loadError && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>
              {t('pipedrive.section_pipeline_error', 'Impossible de charger les pipelines')} — {loadError}
            </div>
          )}

          {!loading && !loadError && (
            <>
              {/* Banners */}
              {banners.map((b, i) => (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: 10, fontSize: 12, marginBottom: 10,
                  background: b.tone === 'warning' ? '#fffbeb' : '#eff6ff',
                  border: '1px solid ' + (b.tone === 'warning' ? '#fde68a' : '#bfdbfe'),
                  color: b.tone === 'warning' ? '#92400e' : '#1d4ed8',
                }}>{b.text}</div>
              ))}

              {/* Section 1 — Pipeline picker */}
              <section style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                  {t('pipedrive.section_pipeline_title', 'Pipeline cible')}
                </h4>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b' }}>
                  {t('pipedrive.section_pipeline_label', 'Choisissez le pipeline Pipedrive dans lequel pousser vos referrals')}
                </p>
                <select
                  value={selectedPipelineId}
                  onChange={e => onPipelineChange(e.target.value)}
                  style={inp}
                  disabled={pipelines.length === 0}
                >
                  {pipelines.length === 0 && <option value="">—</option>}
                  {pipelines.map(p => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}{p.is_default ? `  (${t('pipedrive.section_pipeline_default_badge', 'défaut')})` : ''}
                    </option>
                  ))}
                </select>
              </section>

              {/* Section 2 — Tabs */}
              <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                gap: 4, paddingTop: 4, borderBottom: '1px solid #e2e8f0',
                marginBottom: 16,
              }}>
                {[
                  { id: 'statuses',     label: t('pipedrive.tab_statuses', 'Statuts') },
                  { id: 'deal',         label: t('pipedrive.tab_deal', 'Deal') },
                  { id: 'person',       label: t('pipedrive.tab_person', 'Person') },
                  { id: 'organization', label: t('pipedrive.tab_organization', 'Organization') },
                ].map(tab => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id} onClick={() => setActiveTab(tab.id)}
                      style={{
                        padding: '10px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 14,
                        fontWeight: active ? 600 : 500,
                        color: active ? '#059669' : '#64748b',
                        borderBottom: '2px solid ' + (active ? '#059669' : 'transparent'),
                        marginBottom: -1, transition: 'color .15s, border-color .15s',
                      }}
                    >{tab.label}</button>
                  );
                })}
              </div>

              {/* Statuses tab */}
              {activeTab === 'statuses' && (
                <StatusesTab
                  t={t}
                  stageMap={stageMap}
                  setStageMap={setStageMap}
                  stages={stages}
                  stagesLoading={stagesLoading}
                  pipelineSelected={!!selectedPipelineId}
                />
              )}

              {/* Entity tabs */}
              {(activeTab === 'deal' || activeTab === 'person' || activeTab === 'organization') && (
                <FieldsTab
                  t={t}
                  entity={activeTab}
                  fields={fields[activeTab]}
                  fieldMap={fieldMap[activeTab]}
                  error={fieldsError[activeTab]}
                  onRetry={() => retryFields(activeTab)}
                  onChange={(refField, val) => setFieldMap(prev => ({
                    ...prev,
                    [activeTab]: { ...prev[activeTab], [refField]: val },
                  }))}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #f1f5f9', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 260 }}>
            <button
              type="button"
              onClick={() => setAutoPush(v => !v)}
              aria-pressed={autoPush}
              style={{
                width: 36, height: 20, borderRadius: 999,
                background: autoPush ? '#059669' : '#cbd5e1',
                border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: autoPush ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
                {t('pipedrive.auto_push_label', 'Synchroniser automatiquement les nouveaux referrals avec Pipedrive')}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {t('pipedrive.auto_push_helper', 'Si désactivé, vous devrez pousser manuellement chaque referral depuis sa fiche')}
              </div>
            </div>
          </label>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={onClickClose} style={btnSecondary}>
              {t('pipedrive.cancel', 'Annuler')}
            </button>
            <button
              type="button" onClick={onSave} disabled={saving || loading}
              style={{ ...btnPrimary, opacity: (saving || loading) ? 0.6 : 1 }}
            >
              {saving ? (t('common.saving', 'Enregistrement…')) : t('pipedrive.save', 'Enregistrer')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Statuses tab ────────────────────────────────────────────────────
// Only renders rows for STAGE_MAPPABLE_STATUSES — won/lost get their
// own explanatory block at the bottom because they're not stages in
// Pipedrive (they're values of the deal's `status` field).
function StatusesTab({ t, stageMap, setStageMap, stages, stagesLoading, pipelineSelected }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('pipedrive.statuses_col_refboost', 'Statut RefBoost')}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('pipedrive.statuses_col_pipedrive', 'Stage Pipedrive')}
        </div>
      </div>
      {STAGE_MAPPABLE_STATUSES.map(slug => {
        const label = t(STATUS_LABEL_KEYS[slug], STATUS_FALLBACK[slug]);
        return (
          <div key={slug} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
            <div style={{ fontSize: 13, color: '#0f172a' }}>{label}</div>
            <select
              value={stageMap[slug] || ''}
              onChange={e => setStageMap(prev => ({ ...prev, [slug]: e.target.value }))}
              disabled={!pipelineSelected || stagesLoading}
              style={inp}
            >
              <option value="">{t('pipedrive.statuses_unmapped', '— Non mappé —')}</option>
              {stages.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>
        );
      })}
      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12 }}>
        {t('pipedrive.statuses_helper', 'Les referrals seront poussés vers le stage Pipedrive correspondant à leur statut RefBoost')}
      </p>

      {/* Won / Lost are deal-level status flips in Pipedrive, not
          stage moves. Explain that explicitly so the admin doesn't
          wonder where those rows went. */}
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 10,
        background: '#f8fafc', border: '1px solid #e2e8f0',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <Info size={14} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
          {t('pipedrive.won_lost_auto_helper', "Les statuts 'Gagné' et 'Perdu' sont gérés automatiquement via le status Pipedrive — pas de mapping de stage nécessaire. Lors du push, les deals 'Gagné' seront marqués comme 'won' dans Pipedrive et les 'Perdu' comme 'lost'.")}
        </div>
      </div>
    </div>
  );
}

// ─── Fields tab (Deal / Person / Organization) ──────────────────────
function FieldsTab({ t, entity, fields, fieldMap, error, onRetry, onChange }) {
  const fieldKeys = REFBOOST_FIELDS_BY_ENTITY[entity] || [];

  // Surface upstream errors precisely. The most useful signal is the
  // missing-scope case (Marketplace app config doesn't grant
  // contact-fields:* → Pipedrive 403 on /personFields and
  // /organizationFields). The route handler translates that to
  // pipedrive_missing_scope so we can show a specific message.
  if (error) {
    const isScope = error.code === 'pipedrive_missing_scope';
    const isAuth = error.code === 'pipedrive_unauthorized' || error.code === 'not_connected';
    const tone = isScope || isAuth ? 'error' : 'warning';
    const headline = isScope
      ? t('pipedrive.error_missing_scope', 'Cette intégration Pipedrive n\'a pas le scope nécessaire pour lire les champs Person / Organization. Reconnectez Pipedrive en autorisant le scope « Contacts ».')
      : isAuth
        ? t('pipedrive.error_unauthorized', 'Session Pipedrive expirée. Reconnectez Pipedrive depuis la page Intégrations.')
        : t('pipedrive.error_fields_load', 'Impossible de charger la liste des champs Pipedrive.');
    return (
      <div>
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: tone === 'error' ? '#fef2f2' : '#fffbeb',
          border: '1px solid ' + (tone === 'error' ? '#fecaca' : '#fde68a'),
          color: tone === 'error' ? '#b91c1c' : '#92400e',
          fontSize: 13, marginBottom: 12,
        }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{headline}</div>
          {error.detail && (
            <div style={{ fontSize: 11, opacity: 0.8 }}>{error.detail}</div>
          )}
        </div>
        <button
          type="button" onClick={onRetry}
          style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
            background: '#fff', color: '#0f172a', fontWeight: 500, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {t('common.retry', 'Réessayer')}
        </button>
      </div>
    );
  }
  const description = {
    deal:         t('pipedrive.deal_description', 'Mappez les informations de vos referrals (Deal Pipedrive)'),
    person:       t('pipedrive.person_description', 'Mappez le contact principal du deal (Person Pipedrive)'),
    organization: t('pipedrive.organization_description', 'Mappez l\'entreprise du prospect (Organization Pipedrive)'),
  }[entity];
  const helper = {
    deal:         t('pipedrive.deal_helper', "Les champs standards Pipedrive comme 'Title' et 'Value' sont disponibles, ainsi que vos champs personnalisés"),
    person:       '',
    organization: t('pipedrive.organization_partners_note', "Les partenaires (apporteurs) seront aussi créés en tant qu'Organizations Pipedrive lors du push, avec leur nom mappé sur le champ 'Name'"),
  }[entity];

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>{description}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('pipedrive.statuses_col_refboost', 'Statut RefBoost').replace('Statut', t('pipedrive.field_col_refboost', 'Champ'))}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('pipedrive.fields_col_pipedrive', 'Champ Pipedrive')}
        </div>
      </div>
      {fieldKeys.map(refField => {
        const label = t(FIELD_LABEL_KEYS[refField], FIELD_FALLBACK[refField]);
        // Per-row inline helper. Organization → "company" lands on
        // the Pipedrive standard "name" field 99% of the time, so we
        // surface that hint right under the row to remove the guesswork.
        const rowHelper = (entity === 'organization' && refField === 'company')
          ? t('pipedrive.organization_company_hint', "Le nom de l'entreprise du prospect. Généralement mappé sur le champ « Name » de l'organisation Pipedrive.")
          : null;
        return (
          <div key={refField} style={{ padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: '#0f172a' }}>{label}</div>
              <FieldCombobox
                value={fieldMap[refField] || ''}
                fields={fields}
                onChange={(key) => onChange(refField, key)}
                disabled={fields.length === 0}
              />
            </div>
            {rowHelper && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>{rowHelper}</p>
            )}
          </div>
        );
      })}
      {helper && (
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12 }}>{helper}</p>
      )}
    </div>
  );
}
