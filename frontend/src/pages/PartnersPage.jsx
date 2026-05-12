import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { showConfirm, showToast } from '../components/Dialogs.jsx';
import { fmt, fmtDate, categoryName } from '../lib/constants';
import { Plus, X, Users, Archive, Trash2, Pencil, ArchiveRestore, UserPlus, CheckCircle, XCircle, Clock, User, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import UpgradeModal from '../components/UpgradeModal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';

export default function PartnersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('partners');
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  // Server-side pagination — 12 per page, numbered footer.
  const PARTNERS_PAGE_SIZE = 12;
  const [partnersPage, setPartnersPage] = useState(1);
  const [partnersTotal, setPartnersTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', contact_name: '', email: '', phone: '', company_website: '',
    commission_rate: 10, category_id: '',
    // VAT: defaults match the legacy "no tax" behaviour. Admins can
    // tick the assujetti toggle to capture the new partner's status
    // up-front; otherwise the partner can fill it in later from
    // their own Settings.
    tax_subject: false, tax_country: '', tax_rate: '', tax_id: '',
  });
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tempPwd, setTempPwd] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createdEmail, setCreatedEmail] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Candidatures state
  const [applications, setApplications] = useState([]);
  const [appFilter, setAppFilter] = useState('pending');
  const [appLoading, setAppLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [commissionRate, setCommissionRate] = useState(10);
  const [rejectReason, setRejectReason] = useState('');
  const [upgradePrompt, setUpgradePrompt] = useState(null);
  // Shape: { kind: 'archivePartner'|'deletePartner'|'deleteApplication', id, name? }
  const [confirmAction, setConfirmAction] = useState(null);

  // Loads one page from the server. `page` defaults to 1 because most
  // callers want a fresh slice — the few that explicitly want page-
  // preservation pass the current value in.
  // Loads one page from the server. Pulls in the current filter state
  // (archived, category) so totals match what the UI actually shows.
  const loadPartners = async (overrides = {}) => {
    const showAll  = overrides.showAll  !== undefined ? overrides.showAll  : showArchived;
    const catId    = overrides.catId    !== undefined ? overrides.catId    : categoryFilter;
    const page     = overrides.page     !== undefined ? overrides.page     : partnersPage;
    try {
      const d = await api.getPartnersPaged({
        page, pageSize: PARTNERS_PAGE_SIZE, showAll,
        categoryId: catId && catId !== 'all' ? catId : null,
      });
      setPartners(d.partners || []);
      setPartnersTotal(d.total ?? (d.partners || []).length);
      setPartnersPage(page);
    } catch(e) { console.error(e); }
  };

  const loadApplications = async (filter) => {
    setAppLoading(true);
    try { const d = await api.getApplications(filter || appFilter); setApplications(d.applications || []); } catch(e) { console.error(e); }
    setAppLoading(false);
  };

  useEffect(() => { loadPartners({ showAll: false, page: 1 }).finally(() => setLoading(false)); /* eslint-disable-next-line */ }, []);

  // Deep-link from /search: open the matching partner in the existing
  // edit modal. Wait until the partner list has loaded so startEdit
  // can pick its row up; if the id isn't found (archived?) fall back
  // to a one-shot fetch and seed the form by hand.
  const [searchParams, setSearchParams] = useSearchParams();
  const openIdRef = useRef(null);
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || openIdRef.current === openId) return;
    if (loading) return; // wait for the first list load
    openIdRef.current = openId;
    const match = partners.find(p => p.id === openId);
    if (match) {
      startEdit(match);
    } else {
      api.getPartner(openId)
        .then(d => { const p = d.partner || d; if (p && p.id) startEdit(p); })
        .catch(() => {});
    }
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, partners, loading]);
  useEffect(() => {
    api.getPartnerCategories()
      .then(d => {
        const list = d.categories || [];
        setCategories(list);
        const def = list.find(c => c.is_default) || list[0];
        if (def) setForm(f => ({ ...f, category_id: f.category_id || def.id }));
      })
      .catch(() => setCategories([]));
  }, []);
  useEffect(() => { if (tab === 'candidatures' && isAdmin) loadApplications(); }, [tab, appFilter]);

  const handleArchive = (id) => setConfirmAction({ kind: 'archivePartner', id });
  const handleDeletePartner = (id) => setConfirmAction({ kind: 'deletePartner', id });
  const handleDeleteApplication = (id) => setConfirmAction({ kind: 'deleteApplication', id });

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    const { kind, id } = confirmAction;
    try {
      if (kind === 'archivePartner') {
        await api.archivePartner(id);
        await loadPartners();
      } else if (kind === 'deletePartner') {
        await api.deletePartner(id);
        await loadPartners();
      } else if (kind === 'deleteApplication') {
        await api.deleteApplication(id);
        loadApplications();
        loadPartners();
      }
    } catch (e) {
      showToast.error(e.message);
    } finally {
      setConfirmAction(null);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name, contact_name: p.contact_name, email: p.email, phone: p.phone || '',
      company_website: p.company_website || '', commission_rate: p.commission_rate,
      iban: p.iban || '', bic: p.bic || '', account_holder: p.account_holder || '',
      category_id: p.category_id || '',
      tax_subject: !!p.tax_subject,
      tax_country: p.tax_country || '',
      tax_rate: p.tax_rate != null ? String(p.tax_rate) : '',
      tax_id: p.tax_id || '',
    });
  };
  const saveEdit = async () => {
    try {
      // Mirror partnerBankInfo's contract: when admin marks a partner
      // VAT-subject, country + rate are mandatory. Validate locally so
      // the row doesn't bounce back from the API with a generic 400.
      if (editForm.tax_subject) {
        if (!editForm.tax_country) { showToast.error(t('partners.tax.errors_country_missing', 'Sélectionnez le pays TVA.')); return; }
        const r = parseFloat(editForm.tax_rate);
        if (!Number.isFinite(r) || r <= 0 || r > 30) { showToast.error(t('partners.tax.errors_rate_invalid', 'Taux TVA invalide (0 < r ≤ 30).')); return; }
      }
      const payload = {
        ...editForm,
        tax_subject: !!editForm.tax_subject,
        tax_country: editForm.tax_subject ? (editForm.tax_country || null) : null,
        tax_rate:    editForm.tax_subject ? (parseFloat(editForm.tax_rate) || null) : null,
        tax_id:      editForm.tax_id?.trim() || null,
      };
      await api.updatePartner(editingId, payload);
      setEditingId(null);
      await loadPartners();
    } catch (e) { showToast.error(e.message); }
  };
  // VAT defaults — kept in sync with the partner-side picker in
  // SettingsPage so admins see the same standard rate hint when
  // selecting a country.
  const VAT_DEFAULT_RATES = { FR:20, DE:19, ES:21, IT:22, NL:21, PT:23, BE:21, LU:17, AT:20, IE:23, CH:8.1, UK:20, US:0, OTHER:0 };
  const VAT_COUNTRIES = ['FR','DE','ES','IT','NL','PT','BE','LU','AT','IE','CH','UK','US','OTHER'];

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const data = await api.createPartner(form);
      // Refetch the page so the new partner appears in its proper
      // alphabetical slot + the total counter stays accurate. The
      // create modal stays open with the temp password, so the user
      // doesn't see a list flash.
      await loadPartners({ page: 1 });
      setCreatedEmail(data.partner.email || form.email);
      setTempPwd(data.partner.temp_password || null);
            setForm({ name: '', contact_name: '', email: '', phone: '', company_website: '', commission_rate: 10 });
    setTempPwd(null);
    } catch (err) {
      if (err?.data?.error === 'partner_limit_reached') {
        setUpgradePrompt({ limit: err.data.limit, plan: err.data.plan, upgradeTo: err.data.upgradeTo });
      } else {
        console.error(err);
        showToast.error(err.message);
      }
    }
    setSaving(false);
  };

  const handleApprove = async () => {
    try { await api.approveApplication(selectedApp.id, commissionRate); setSelectedApp(null); loadApplications(); }
    catch(e) {
      if (e?.data?.error === 'partner_limit_reached') {
        setSelectedApp(null);
        setUpgradePrompt({ limit: e.data.limit, plan: e.data.plan, upgradeTo: e.data.upgradeTo });
      } else {
        showToast.error(e.message);
      }
    }
  };
  const handleReject = async () => {
    try { await api.rejectApplication(selectedApp.id, rejectReason); setSelectedApp(null); setRejectReason(''); loadApplications(); } catch(e) { showToast.error(e.message); }
  };

  // Server already applies category + active filters, so the local
  // arrays are just an active/archived split of the page slice. The
  // visible counter uses partnersTotal which IS server-authoritative.
  const activePartners = partners.filter(p => p.is_active !== false);
  const archivedPartners = partners.filter(p => p.is_active === false);
  const pendingCount = applications.filter(a => a.status === 'pending').length;

  if (loading) return <PageSkeleton />;

  return (
    <div className="fade-in">
      {upgradePrompt && (
        <UpgradeModal
          limit={upgradePrompt.limit}
          plan={upgradePrompt.plan}
          upgradeTo={upgradePrompt.upgradeTo}
          onClose={() => setUpgradePrompt(null)}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmAction}
        title={confirmAction?.kind === 'archivePartner'
          ? t('partners.archive')
          : t('partners.delete_confirm_title')}
        message={confirmAction?.kind === 'archivePartner'
          ? t('partners.confirm_archive')
          : t('partners.delete_confirm_body')}
        confirmLabel={confirmAction?.kind === 'archivePartner' ? t('partners.archive') : t('partners.delete')}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant={confirmAction?.kind === 'archivePartner' ? 'warning' : 'danger'}
        onConfirm={runConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
      {/* Edit modal */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setEditingId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 480, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, color: '#0f172a' }}>{t('partners.edit_title')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['name', t('partners.field_company').replace(' *', '')], ['contact_name', t('partners.contact')], ['email', t('partners.email')], ['phone', t('partners.phone')], ['company_website', t('partners.field_website')], ['commission_rate', t('partners.rate')], ['account_holder', t('partners.field_holder')], ['iban', t('partners.iban')], ['bic', t('partners.field_bic')]].map(([key, label]) => (
                <div key={key} style={{ gridColumn: key === 'iban' ? '1 / -1' : undefined }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                  <input value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} type={key === 'commission_rate' ? 'number' : 'text'} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4, fontFamily: ['iban', 'bic'].includes(key) ? 'monospace' : 'inherit' }} />
                </div>
              ))}
              {categories.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('partner_category.title').replace(/s$/, '')}</label>
                  <select
                    value={editForm.category_id || ''}
                    onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4, background: '#fff' }}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{categoryName(c)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ─── Informations fiscales ───────────────────────── */}
              <div style={{ gridColumn: '1 / -1', marginTop: 12, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                  {t('partners.tax_section', 'Informations fiscales')}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer', marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!editForm.tax_subject}
                    onChange={e => setEditForm(f => ({ ...f, tax_subject: e.target.checked }))}
                  />
                  {t('partners.tax_subject_label', 'Assujetti à la TVA')}
                </label>
                {editForm.tax_subject && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('partners.tax_country_label', 'Pays')}</label>
                      <select
                        value={editForm.tax_country || ''}
                        onChange={e => {
                          const next = e.target.value;
                          // Suggest the standard rate when the admin
                          // hasn't typed a custom one (or it matches
                          // the previous country's default).
                          setEditForm(f => {
                            const prevDefault = VAT_DEFAULT_RATES[f.tax_country];
                            const cur = f.tax_rate ? parseFloat(f.tax_rate) : null;
                            const align = (cur == null) || (prevDefault != null && cur === prevDefault);
                            const aligned = align && VAT_DEFAULT_RATES[next] != null
                              ? String(VAT_DEFAULT_RATES[next])
                              : f.tax_rate;
                            return { ...f, tax_country: next, tax_rate: aligned };
                          });
                        }}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4, background: '#fff' }}
                      >
                        <option value="">—</option>
                        {VAT_COUNTRIES.map(cc => (
                          <option key={cc} value={cc}>{cc} ({VAT_DEFAULT_RATES[cc]}%)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('partners.tax_rate_label', 'Taux TVA (%)')}</label>
                      <input
                        type="number" min="0" max="30" step="0.01"
                        value={editForm.tax_rate || ''}
                        onChange={e => setEditForm(f => ({ ...f, tax_rate: e.target.value }))}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('partners.tax_id_label', 'N° TVA intracom')} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({t('common.optional', 'optionnel')})</span></label>
                      <input
                        value={editForm.tax_id || ''}
                        onChange={e => setEditForm(f => ({ ...f, tax_id: e.target.value }))}
                        placeholder="FR12345678901"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4, fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('partners.cancel')}</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('partners.save')}</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <button onClick={() => { handleArchive(editingId); setEditingId(null); }} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #fcd34d', background: '#fffbeb', color: '#b45309', fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Archive size={14} /> {t('partners.archive')}</button>
              <button onClick={() => setDeleteConfirm(editingId)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={14} /> {t('partners.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Application detail modal */}
      {selectedApp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setSelectedApp(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 520, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{selectedApp.company_name}</h3>
                <p style={{ color: '#64748b', fontSize: 14 }}>{selectedApp.contact_name} · {selectedApp.email}</p>
              </div>
              <button onClick={() => setSelectedApp(null)} style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <InfoBlock label={t('partners.app_phone')} value={selectedApp.phone || '—'} />
              <InfoBlock label={t('partners.app_website')} value={selectedApp.company_website || '—'} />
              <InfoBlock label={t('partners.app_size')} value={selectedApp.company_size || '—'} />
              <InfoBlock label={t('partners.app_date')} value={fmtDate(selectedApp.created_at)} />
            </div>
            {selectedApp.motivation && (
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 6 }}>{t('partners.app_motivation')}</div>
                <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6 }}>{selectedApp.motivation}</p>
              </div>
            )}
            {selectedApp.status === 'pending' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6, display: 'block' }}>{t('partners.app_rate')}</label>
                  <input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, width: 120 }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleApprove} style={{ flex: 1, padding: 13, borderRadius: 12, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircle size={16} /> {t('partners.app_accept')}</button>
                  <button onClick={handleReject} style={{ flex: 1, padding: 13, borderRadius: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><XCircle size={16} /> {t('partners.app_reject')}</button>
                </div>
              </div>
            )}
            {selectedApp.status !== 'pending' && (
              <div style={{ padding: '12px 16px', borderRadius: 10, background: selectedApp.status === 'approved' ? '#f0fdf4' : '#fef2f2', color: selectedApp.status === 'approved' ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 14 }}>
                {selectedApp.status === 'approved' ? t('partners.app_accepted') : t('partners.app_rejected')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 420, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={28} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{t('partners.delete_confirm_title')}</h3>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{t('partners.delete_confirm_body')}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: 13, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, color: '#475569' }}>{t('partners.cancel')}</button>
              <button onClick={() => { handleDeletePartner(deleteConfirm); setDeleteConfirm(null); setEditingId(null); }} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={16} /> {t('partners.delete')}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#0f172a', letterSpacing: -0.2, margin: 0 }}>{t('partners.title')}</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{t('partners.active_count', { count: partnersTotal })}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {tab === 'partners' && categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); loadPartners({ catId: e.target.value, page: 1 }); }}
              style={{ padding: '10px 14px', borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            >
              <option value="all">{t('partner_category.filter')}</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{categoryName(c)}</option>
              ))}
            </select>
          )}
          {tab === 'partners' && (
            <>
              <button onClick={() => { const next = !showArchived; setShowArchived(next); loadPartners({ showAll: next, page: 1 }); }} style={{ padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '2px solid #e2e8f0', background: showArchived ? '#fef3c7' : '#fff', color: showArchived ? '#b45309' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Archive size={14} /> {showArchived ? `${t('partners.archived')} (${archivedPartners.length})` : t('partners.see_archived')}
              </button>
              <button onClick={() => { setShowForm(!showForm); setCreatedEmail(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: showForm ? '#f1f5f9' : 'var(--rb-primary, #059669)', color: showForm ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                {showForm ? <X size={16} /> : <Plus size={16} />}
                {showForm ? t('partners.cancel') : t('partners.add')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content' }}>
        <button onClick={() => setTab('partners')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === 'partners' ? '#fff' : 'transparent', color: tab === 'partners' ? '#0f172a' : '#64748b', boxShadow: tab === 'partners' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} /> {t('partners.tab_partners')}
        </button>
        {isAdmin && (
          <button onClick={() => setTab('candidatures')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === 'candidatures' ? '#fff' : 'transparent', color: tab === 'candidatures' ? '#0f172a' : '#64748b', boxShadow: tab === 'candidatures' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserPlus size={14} /> {t('partners.tab_applications')}
            {pendingCount > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}>{pendingCount}</span>}
          </button>
        )}
      </div>

      {tab === 'partners' && (
        <>
          {/* Create form */}
          {showForm && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, border: '1px solid #e2e8f0', marginBottom: 24 }} className="fade-in">
              {tempPwd ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}></div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('partners.temp_created')}</h3>
                  <p style={{ color: '#64748b', marginBottom: 16, fontSize: 14 }}>{t('partners.temp_creds')}</p>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, display: 'inline-block', textAlign: 'left' }}>
                    <p style={{ fontSize: 13, marginBottom: 4 }}><strong>{t('partners.temp_email')}</strong> {form.email || partners[partners.length-1]?.email}</p>
                    <p style={{ fontSize: 13 }}><strong>{t('partners.temp_pwd')}</strong> <code style={{ background: '#eef2ff', padding: '2px 8px', borderRadius: 4, color: 'var(--rb-primary, #059669)' }}>{tempPwd}</code></p>
                  </div>
                  <div style={{ marginTop: 20 }}><button onClick={() => { setShowForm(false); setCreatedEmail(null); }} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>{t('common.close')}</button></div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 20 }}>{t('partners.add_title')}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <FormField label={t('partners.field_company')} value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
                    <FormField label={t('partners.field_contact')} value={form.contact_name} onChange={v => setForm(f => ({ ...f, contact_name: v }))} required />
                    <FormField label={t('partners.field_email')} value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" required />
                    <FormField label={t('partners.field_phone')} value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
                    <FormField label={t('partners.field_website')} value={form.company_website} onChange={v => setForm(f => ({ ...f, company_website: v }))} />
                    <FormField label={t('partners.field_rate')} value={form.commission_rate} onChange={v => setForm(f => ({ ...f, commission_rate: v }))} type="number" />
                    {categories.length > 0 && (
                      <div>
                        <label style={{ display: 'block', color: '#475569', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('partner_category.select')}</label>
                        <select
                          value={form.category_id}
                          onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', background: '#fff' }}
                        >
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{categoryName(c)}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Optional: capture VAT status at creation time so
                      the partner's first commission already wires the
                      right gross amount. Defaults off → identical to
                      the legacy create flow. */}
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer', marginBottom: form.tax_subject ? 12 : 0 }}>
                      <input
                        type="checkbox"
                        checked={!!form.tax_subject}
                        onChange={e => setForm(f => ({ ...f, tax_subject: e.target.checked }))}
                      />
                      <span>{t('partners.tax_subject_label', 'Assujetti à la TVA')} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({t('common.optional', 'optionnel')})</span></span>
                    </label>
                    {form.tax_subject && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', color: '#475569', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('partners.tax_country_label', 'Pays')}</label>
                          <select
                            value={form.tax_country || ''}
                            onChange={e => {
                              const next = e.target.value;
                              setForm(f => {
                                const prevDefault = VAT_DEFAULT_RATES[f.tax_country];
                                const cur = f.tax_rate ? parseFloat(f.tax_rate) : null;
                                const align = (cur == null) || (prevDefault != null && cur === prevDefault);
                                const aligned = align && VAT_DEFAULT_RATES[next] != null
                                  ? String(VAT_DEFAULT_RATES[next])
                                  : f.tax_rate;
                                return { ...f, tax_country: next, tax_rate: aligned };
                              });
                            }}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', background: '#fff' }}
                          >
                            <option value="">—</option>
                            {VAT_COUNTRIES.map(cc => (
                              <option key={cc} value={cc}>{cc} ({VAT_DEFAULT_RATES[cc]}%)</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', color: '#475569', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('partners.tax_rate_label', 'Taux TVA (%)')}</label>
                          <input
                            type="number" min="0" max="30" step="0.01"
                            value={form.tax_rate || ''}
                            onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <button type="submit" disabled={saving} style={{ padding: '12px 24px', borderRadius: 12, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? t('partners.creating') : t('partners.create')}</button>
                </form>
              )}
            </div>
          )}

          {/* Partners Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {activePartners.map(p => <PartnerCard key={p.id} partner={p} onEdit={startEdit} onArchive={handleArchive} onDelete={handleDeletePartner} />)}
          </div>

          {/* Numbered pagination — 12 partners per page server-side.
              Footer hidden when the whole list fits a single page. */}
          {partnersTotal > PARTNERS_PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <Pagination
                currentPage={partnersPage}
                totalPages={Math.ceil(partnersTotal / PARTNERS_PAGE_SIZE)}
                onPageChange={(p) => { loadPartners({ page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              />
            </div>
          )}

          {/* Archived */}
          {showArchived && archivedPartners.length > 0 && (
            <div style={{ marginTop: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Archive size={18} color="#b45309" />
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#b45309' }}>{t('partners.archived')}</h2>
                <span style={{ padding: '2px 10px', borderRadius: 20, background: '#fef3c7', color: '#b45309', fontSize: 12, fontWeight: 600 }}>{archivedPartners.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                {archivedPartners.map(p => (
                  <div key={p.id} style={{ background: '#fffbeb', borderRadius: 16, padding: 24, border: '1px solid #fcd34d' }}>
                    <div style={{ fontWeight: 700, color: '#92400e', fontSize: 18 }}>{p.name}</div>
                    <div style={{ color: '#b45309', fontSize: 13, marginTop: 2, marginBottom: 16 }}>{p.contact_name} · {p.email}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleArchive(p.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ArchiveRestore size={14} /> {t('partners.restore')}</button>
                      <button onClick={() => handleDeletePartner(p.id)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'candidatures' && isAdmin && (
        <>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 20, width: 'fit-content' }}>
            {[['pending', t('partners.app_filter_pending')], ['all', t('partners.app_filter_all')], ['approved', t('partners.app_filter_approved')], ['rejected', t('partners.app_filter_rejected')]].map(([k, label]) => (
              <button key={k} onClick={() => setAppFilter(k)} style={{
                padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: appFilter === k ? '#fff' : 'transparent', color: appFilter === k ? '#0f172a' : '#64748b',
                boxShadow: appFilter === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{label}</button>
            ))}
          </div>

          {appLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('partners.loading')}</div>
          ) : applications.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>{t('partners.app_none')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {applications.map(a => {
                const statusColors = { pending: { bg: '#fffbeb', color: '#f59e0b', label: t('partners.app_filter_pending') }, approved: { bg: '#f0fdf4', color: '#16a34a', label: t('partners.app_filter_approved') }, rejected: { bg: '#fef2f2', color: '#dc2626', label: t('partners.app_filter_rejected') } };
                const sc = statusColors[a.status] || statusColors.pending;
                return (
                  <div key={a.id} style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1px solid #e2e8f0', borderLeft: `4px solid ${sc.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 16 }}>{a.company_name}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{a.contact_name} · {a.email} · {fmtDate(a.created_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setSelectedApp(a); setCommissionRate(10); }} style={{ padding: '6px 14px', borderRadius: 8, background: '#eef2ff', border: 'none', color: 'var(--rb-primary, #059669)', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={12} /> {t('partners.app_review')}
                      </button>
                      <button onClick={() => handleDeleteApplication(a.id)} title={t('partners.delete')} style={{ padding: '6px 10px', borderRadius: 8, background: '#fef2f2', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PartnerCard({ partner: p, onEdit, onArchive, onDelete }) {
  const { t } = useTranslation();
  const refs = parseInt(p.total_referrals || 0);
  const won = parseInt(p.won_deals || 0);
  const conv = refs > 0 ? Math.round((won / refs) * 100) : 0;
  const confirmArchive = (e) => { e.stopPropagation(); onArchive(p.id); };
  const confirmDelete = (e) => { e.stopPropagation(); onDelete(p.id); };
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18 }}>{p.name}</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{p.contact_name} · {p.email}</div>
          {p.category_name && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '3px 8px', borderRadius: 999, background: (p.category_color || '#6B7280') + '15', color: p.category_color || '#6B7280', fontSize: 11, fontWeight: 700 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.category_color || '#6B7280' }} />
              {categoryName({ slug: p.category_slug, name: p.category_name })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ padding: '4px 10px', borderRadius: 8, background: '#eef2ff', color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 13 }}>{p.commission_rate}%</span>
          <button onClick={(e) => { e.stopPropagation(); onEdit(p); }} title={t('partners.edit_title')} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: '#64748b', display: 'flex' }}><Pencil size={13} /></button>
          <button onClick={confirmArchive} title={t('partners.archive')} style={{ background: '#fffbeb', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: '#b45309', display: 'flex' }}><Archive size={13} /></button>
          <button onClick={confirmDelete} title={t('partners.delete')} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: '#dc2626', display: 'flex' }}><Trash2 size={13} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        <MiniStat label={t('partners.stat_referrals')} value={refs} />
        <MiniStat label={t('partners.stat_won')} value={won} color="#16a34a" />
        <MiniStat label={t('partners.stat_conversion')} value={`${conv}%`} color="#6366f1" />
        <MiniStat label={t('partners.stat_ca')} value={fmt(p.total_revenue)} color="#0f172a" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (<div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}><div style={{ fontSize: 17, fontWeight: 800, color: color || '#0f172a' }}>{value}</div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>{label}</div></div>);
}
function InfoBlock({ label, value }) {
  return (<div><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div><div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2, fontSize: 14 }}>{value}</div></div>);
}
function FormField({ label, value, onChange, type = 'text', required }) {
  return (<div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, color: '#0f172a', boxSizing: 'border-box' }} /></div>);
}
