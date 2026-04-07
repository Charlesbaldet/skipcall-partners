import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Send, AlertTriangle } from 'lucide-react';

export default function PublicTrackingPage() {
  const { code } = useParams();
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    prospect_name: '', prospect_email: '', prospect_phone: '',
    prospect_company: '', prospect_role: '', notes: '',
  });

  useEffect(() => {
    fetch(`/api/track/${code}`)
      .then(r => r.json())
      .then(d => { if (d.partner) setPartner(d.partner); else setError('Lien invalide'); })
      .catch(() => setError('Erreur de connexion'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.prospect_name || !form.prospect_email) return;
    setSending(true);
    try {
      const res = await fetch(`/api/track/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) { setSubmitted(true); } else { alert(data.error || 'Erreur'); }
    } catch { alert('Erreur de connexion'); }
    setSending(false);
  };

  const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 15, boxSizing: 'border-box', transition: 'border 0.2s' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 14, marginBottom: 6 };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}><div style={{ color: '#94a3b8' }}>Chargement...</div></div>;

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <AlertTriangle size={48} color="#f59e0b" />
        <h2 style={{ color: '#0f172a', marginTop: 16 }}>{error}</h2>
        <p style={{ color: '#64748b' }}>Ce lien de recommandation n'est pas valide.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }} className="fade-in">
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle size={40} color="#16a34a" />
        </div>
        <h2 style={{ color: '#0f172a', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Merci !</h2>
        <p style={{ color: '#64748b', lineHeight: 1.6 }}>Votre demande a été envoyée. L'équipe de <strong>{partner.name}</strong> vous contactera très prochainement.</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 28, maxWidth: 520, width: '100%', padding: 40, boxShadow: '0 25px 80px rgba(0,0,0,0.3)' }} className="fade-in">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, var(--rb-primary, #059669), var(--rb-accent, #f97316))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 30px rgba(99,102,241,0.3)' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>S</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Recommandé par {partner.name}</h1>
          <p style={{ color: '#64748b', fontSize: 15 }}>Remplissez ce formulaire et nous vous recontacterons</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Nom complet *</label>
              <input value={form.prospect_name} onChange={e => setForm(f => ({ ...f, prospect_name: e.target.value }))} placeholder="Jean Dupont" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={form.prospect_email} onChange={e => setForm(f => ({ ...f, prospect_email: e.target.value }))} placeholder="jean@entreprise.com" required style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Téléphone</label>
              <input value={form.prospect_phone} onChange={e => setForm(f => ({ ...f, prospect_phone: e.target.value }))} placeholder="+33 6 12 34 56 78" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Entreprise</label>
              <input value={form.prospect_company} onChange={e => setForm(f => ({ ...f, prospect_company: e.target.value }))} placeholder="Nom de l'entreprise" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Votre rôle</label>
            <input value={form.prospect_role} onChange={e => setForm(f => ({ ...f, prospect_role: e.target.value }))} placeholder="CEO, CTO, DG..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Message (optionnel)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Décrivez votre besoin..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button type="submit" disabled={sending || !form.prospect_name || !form.prospect_email} style={{
            padding: '14px', borderRadius: 14, fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--rb-primary, #059669), var(--rb-accent, #f97316))', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: sending ? 0.7 : 1, boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
          }}>
            <Send size={18} /> {sending ? 'Envoi...' : 'Envoyer ma demande'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 20 }}>
          Powered by <strong style={{ color: '#6366f1' }}>Skipcall</strong>
        </p>
      </div>
    </div>
  );
}
