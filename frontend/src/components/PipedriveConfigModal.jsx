import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X as XIcon } from 'lucide-react';
import api from '../lib/api';
import { showToast, showConfirm } from './Dialogs.jsx';

// ─── Domain constants — mirrors backend pipedriveService.js ─────────
const CANONICAL_STATUSES = ['new', 'contacted', 'qualified', 'meeting', 'proposal', 'won', 'lost'];

// Each entity tab lists which RefBoost fields are allowed to map to a
// Pipedrive {entity} field. The backend whitelist is broader (8 fields
// total); we expose only the subset that makes semantic sense per
// entity. Adding extras later is one-line per entity.
const REFBOOST_FIELDS_BY_ENTITY = {
  deal:         ['prospect_name', 'mrr', 'notes'],
  person:       ['prospect_name', 'email', 'phone', 'role'],
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
  prospect_name: 'pipedrive.field_prospect_name',
  email:         'pipedrive.field_email',
  phone:         'pipedrive.field_phone',
  company:       'pipedrive.field_company',
  notes:         'pipedrive.field_notes',
  mrr:           'pipedrive.field_mrr',
  partner_name:  'pipedrive.field_partner_name',
  role:          'pipedrive.field_role',
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
        const incomingStageMap = Object.fromEntries(CANONICAL_STATUSES.map(s => [s, '']));
        for (const m of mappingsResp?.stage_mappings || []) {
          if (CANONICAL_STATUSES.includes(m.refboost_status)) {
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

  // Lazy-load fields for an entity when the tab is first opened.
  const fieldsLoadedRef = useRef(new Set());
  useEffect(() => {
    if (activeTab === 'statuses') return;
    const entity = activeTab; // 'deal' | 'person' | 'organization'
    if (fieldsLoadedRef.current.has(entity)) return;
    fieldsLoadedRef.current.add(entity);
    api.getPipedriveFields(entity)
      .then(r => setFields(prev => ({ ...prev, [entity]: r.fields || [] })))
      .catch(e => {
        console.error('[pipedrive.fields]', entity, e);
        fieldsLoadedRef.current.delete(entity); // allow a retry on next tab open
      });
  }, [activeTab]);

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
      // Stage mappings: only persist non-empty entries, with the
      // current pipeline id attached.
      const stage_mappings = CANONICAL_STATUSES
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
  const banners = useMemo(() => {
    const out = [];
    if (!selectedPipelineId) {
      out.push({ tone: 'warning', text: t('pipedrive.warning_no_pipeline', 'Sélectionnez un pipeline pour activer la synchronisation') });
    }
    if (selectedPipelineId && !stageMap.won) {
      out.push({ tone: 'warning', text: t('pipedrive.warning_no_won_mapping', "Sans mapping pour 'Gagné', les deals signés ne seront pas synchronisés") });
    }
    if (pipelines.length === 0 && !loading && !loadError) {
      out.push({ tone: 'info', text: t('pipedrive.no_pipelines', 'Aucun pipeline trouvé. Créez un pipeline dans Pipedrive avant de configurer la synchronisation.') });
    }
    return out;
  }, [selectedPipelineId, stageMap, pipelines.length, loading, loadError, t]);

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
      {CANONICAL_STATUSES.map(slug => {
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
    </div>
  );
}

// ─── Fields tab (Deal / Person / Organization) ──────────────────────
function FieldsTab({ t, entity, fields, fieldMap, onChange }) {
  const fieldKeys = REFBOOST_FIELDS_BY_ENTITY[entity] || [];
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
        return (
          <div key={refField} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
            <div style={{ fontSize: 13, color: '#0f172a' }}>{label}</div>
            <select
              value={fieldMap[refField] || ''}
              onChange={e => onChange(refField, e.target.value)}
              style={inp}
              disabled={fields.length === 0}
            >
              <option value="">{t('pipedrive.statuses_unmapped', '— Non mappé —')}</option>
              {fields.map(f => (
                <option key={f.key} value={f.key}>
                  {f.name}{f.is_custom ? `  · ${t('pipedrive.custom_field_badge', 'personnalisé')}` : ''}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {helper && (
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12 }}>{helper}</p>
      )}
    </div>
  );
}
