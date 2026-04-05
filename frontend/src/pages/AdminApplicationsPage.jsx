import { useState, useEffect } from 'react';
import api from '../lib/api';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; const fmtDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
import { UserPlus, CheckCircle, XCircle, Clock, Building, Mail, Phone, Globe, Users, User, X } from 'lucide-react';

const STATUS_BADGE = {
  pending: { label: 'En attente', color: '#f59e0b', bg: '#fffbeb' },
  approved: { label: 'Acceptée', color: '#16a34a', bg: '#f0fdf4' },
  rejected: { label: 'Refusée', color: '#dc2626', bg: '#fef2f2' },
};

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [commissionRate, setCommissionRate] = useState(10);
  const [rejectReason, setRejectReason] = useState('');
  const [tempPwd, setTempPwd] = useState(null);

  const load = async () => {
    try {
      const data = await api.getApplications(filter);
      setApplications(data.applications);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (id) => {
    setProcessing(true);
    try {
      const data = await api.approveApplication(id, commissionRate);
      setTempPwd(data.tempPassword);
      load();
    } catch (err) { alert(err.message); }
    setProcessing(false);
  };

  const handleReject = async (id) => {
    setProcessing(true);
    try {
      await api.rejectApplication(id, rejectReason);
      setSelected(null);
      load();
    } catch (err) { alert(err.message); }
    setProcessing(false);
  };

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Candidatures</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>
            {pendingCount > 0 ? `${pendingCount} candidature${pendingCount > 1 ? 's' : ''} en attente` : 'Aucune candidature en attente'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          {[{ id: 'pending', label: 'En attente' }, { id: 'all', label: 'Toutes' }, { id: 'approved', label: 'Acceptées' }, { id: 'rejected', label: 'Refusées' }].map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: filter === t.id ? '#fff' : 'transparent', color: filter === t.id ? '#0f172a' : '#64748b',
              boxShadow: filter === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {applications.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <UserPlus size={40} color="#94a3b8" style={{ marginBottom: 16, opacity: 0.3 }} />
          <p style={{ color: '#94a3b8', fontSize: 15 }}>Aucune candidature</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {applications.map(app => {
            const badge = STATUS_BADGE[app.status];
            return (
              <div key={app.id} onClick={() => { setSelected(app); setTempPwd(null); setRejectReason(''); setCommissionRate(10); }}
                style={{
                  background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', cursor: 'pointer',
                  borderLeft: app.status === 'pending' ? '4px solid #f59e0b' : '4px solid transparent',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 17 }}>{app.company_name}</span>
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                      {app.contact_name} · {app.email} · {fmtDate(app.created_at)}
                    </div>
                  </div>
                  {app.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={(e) => { e.stopPropagation(); setSelected(app); }} style={{
                        padding: '8px 16px', borderRadius: 10, background: '#f0fdf4', border: 'none',
                        color: '#16a34a', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}><CheckCircle size={14} /> Examiner</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => setSelected(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 580, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{selected.company_name}</h2>
                <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Candidature du {fmtDate(selected.created_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: '#f1f5f9', border: 'none', width: 38, height: 38, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color="#475569" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <InfoRow icon={User} label="Contact" value={selected.contact_name} />
              <InfoRow icon={Mail} label="Email" value={selected.email} />
              <InfoRow icon={Phone} label="Téléphone" value={selected.phone || '—'} />
              <InfoRow icon={Globe} label="Site web" value={selected.company_website || '—'} />
              <InfoRow icon={Users} label="Taille" value={selected.company_size || '—'} />
              <InfoRow icon={Clock} label="Soumis le" value={fmtDateTime(selected.created_at)} />
            </div>

            {selected.motivation && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Motivation</div>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, color: '#334155', fontSize: 14, lineHeight: 1.6, borderLeft: '3px solid #6366f1' }}>{selected.motivation}</div>
              </div>
            )}

            {tempPwd && (
              <div style={{ background: '#f0fdf4', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                <CheckCircle size={24} color="#16a34a" style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 12 }}>Partenaire créé !</div>
                <div style={{ background: '#fff', borderRadius: 10, padding: 12, display: 'inline-block', textAlign: 'left' }}>
                  <p style={{ fontSize: 13, marginBottom: 4 }}><strong>Email :</strong> {selected.email}</p>
                  <p style={{ fontSize: 13, margin: 0 }}><strong>Mot de passe :</strong> <code style={{ background: '#eef2ff', padding: '2px 8px', borderRadius: 4, color: '#6366f1' }}>{tempPwd}</code></p>
                </div>
              </div>
            )}

            {selected.status === 'pending' && !tempPwd && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Taux de commission (%)</label>
                  <input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} min="0" max="50"
                    style={{ width: 120, padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 16, fontWeight: 600, color: '#0f172a', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => handleApprove(selected.id)} disabled={processing} style={{
                    flex: 1, padding: '14px', borderRadius: 12,
                    background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff',
                    border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: processing ? 0.7 : 1,
                  }}>
                    <CheckCircle size={18} /> Accepter
                  </button>
                  <button onClick={() => handleReject(selected.id)} disabled={processing} style={{
                    flex: 1, padding: '14px', borderRadius: 12,
                    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                    fontWeight: 600, fontSize: 15, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: processing ? 0.7 : 1,
                  }}>
                    <XCircle size={18} /> Refuser
                  </button>
                </div>
              </div>
            )}

            {selected.status === 'rejected' && selected.rejection_reason && (
              <div style={{ background: '#fef2f2', borderRadius: 12, padding: 16, borderLeft: '3px solid #dc2626' }}>
                <div style={{ fontWeight: 600, color: '#dc2626', fontSize: 13, marginBottom: 4 }}>Motif du refus</div>
                <div style={{ color: '#991b1b', fontSize: 14 }}>{selected.rejection_reason}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color="#64748b" />
      </div>
      <div>
        <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div>
        <div style={{ color: '#0f172a', fontWeight: 500, marginTop: 1, fontSize: 14 }}>{value}</div>
      </div>
    </div>
  );
}
