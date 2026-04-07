import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../lib/api';
import { fmtDateTime } from '../lib/constants';
import { MessageCircle, Plus, Send, X, Archive, Trash2, Users } from 'lucide-react';

const ROLE_BADGE = {
  admin: { label: 'Admin', color: '#dc2626', bg: '#fef2f2' },
  commercial: { label: 'Commercial', color: '#0891b2', bg: '#ecfeff' },
  partner: { label: 'Partenaire', color: 'var(--rb-primary, #047857)', bg: '#eef2ff' },
};

export default function MessagingPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [newConvForm, setNewConvForm] = useState({ subject: '', participant_ids: [], message: '' });
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const loadConversations = async () => {
    try { const data = await api.getConversations(); setConversations(data.conversations); } catch (err) { console.error(err); }
  };

  useEffect(() => {
    loadConversations().finally(() => setLoading(false));
    pollRef.current = setInterval(loadConversations, 10000);
    return () => clearInterval(pollRef.current);
  }, []);

  const openConversation = async (conv) => {
    setActiveConv(conv);
    try {
      const data = await api.getMessages(conv.id);
      setMessages(data.messages); setParticipants(data.participants);
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: '0' } : c));
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (!activeConv) return;
    const interval = setInterval(async () => {
      try { const data = await api.getMessages(activeConv.id); setMessages(data.messages); } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [activeConv?.id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      const data = await api.sendMessage(activeConv.id, newMessage.trim());
      setMessages(prev => [...prev, data.message]); setNewMessage(''); loadConversations();
    } catch (err) { console.error(err); }
    setSending(false);
  };

  const openNewConversation = async () => {
    setShowNew(true);
    try { const data = await api.getMessageableUsers(); setAvailableUsers(data.users); } catch (err) { console.error(err); }
  };

  const handleCreateConversation = async () => {
    if (!newConvForm.subject.trim() || !newConvForm.message.trim() || newConvForm.participant_ids.length === 0) return;
    setCreating(true);
    try {
      const data = await api.createConversation(newConvForm);
      setShowNew(false); setNewConvForm({ subject: '', participant_ids: [], message: '' });
      await loadConversations(); openConversation(data.conversation);
    } catch (err) { alert(err.message); }
    setCreating(false);
  };

  const handleDeleteConversation = async (id) => {
    try {
      await api.request(`/messages/conversations/${id}`, { method: 'DELETE' });
      if (activeConv?.id === id) { setActiveConv(null); setMessages([]); }
      setDeleteConfirm(null); loadConversations();
    } catch (err) { alert(err.message); }
  };

  const toggleParticipant = (uid) => {
    setNewConvForm(f => ({ ...f, participant_ids: f.participant_ids.includes(uid) ? f.participant_ids.filter(id => id !== uid) : [...f.participant_ids, uid] }));
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 400, boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={28} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Supprimer cette conversation ?</h3>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>Tous les messages seront supprimés.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: 13, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, color: '#475569' }}>Annuler</button>
              <button onClick={() => handleDeleteConversation(deleteConfirm)} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={16} /> Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Messagerie</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>Échangez avec l'équipe Skipcall</p>
        </div>
        <button onClick={openNewConversation} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: 'var(--rb-primary, #047857)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          <Plus size={16} /> Nouvelle conversation
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, height: 'calc(100vh - 200px)', minHeight: 500 }}>
        {/* Conversations list */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>Conversations</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                <MessageCircle size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                <p>Aucune conversation</p>
              </div>
            ) : conversations.map(conv => {
              const unread = parseInt(conv.unread_count || 0);
              const active = activeConv?.id === conv.id;
              return (
                <div key={conv.id} style={{ position: 'relative' }}
                  onMouseEnter={e => e.currentTarget.querySelector('.conv-actions').style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.querySelector('.conv-actions').style.opacity = '0'}
                >
                  <div onClick={() => openConversation(conv)} style={{
                    padding: '14px 20px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                    background: active ? '#eef2ff' : unread > 0 ? '#fafbff' : '#fff',
                    borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontWeight: unread > 0 ? 700 : 600, color: '#0f172a', fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.subject}
                      </div>
                      {unread > 0 && <span style={{ background: 'var(--rb-primary, #047857)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '1px 8px', marginLeft: 8, flexShrink: 0 }}>{unread}</span>}
                    </div>
                    {/* Partner name prominently displayed */}
                    {conv.partner_name && (
                      <div style={{ fontSize: 12, color: 'var(--rb-primary, #047857)', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={11} /> {conv.partner_name}
                      </div>
                    )}
                    {conv.last_message && (
                      <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 500 }}>{conv.last_message_by}: </span>{conv.last_message}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{timeAgo(conv.last_message_at)}</div>
                  </div>
                  {/* Action buttons */}
                  <div className="conv-actions" style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.15s' }}>
                    <button onClick={e => { e.stopPropagation(); setDeleteConfirm(conv.id); }} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', display: 'flex' }} title="Supprimer">
                      <Trash2 size={13} color="#dc2626" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Message thread */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeConv ? (
            <>
              {/* Header with partner name */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 16 }}>{activeConv.subject}</div>
                  {activeConv.partner_name && (
                    <div style={{ fontSize: 13, color: 'var(--rb-primary, #047857)', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={12} /> {activeConv.partner_name}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {participants.map(p => p.full_name).join(', ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setDeleteConfirm(activeConv.id)} style={{ background: '#fef2f2', border: 'none', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={14} color="#dc2626" />
                  </button>
                  <button onClick={() => setActiveConv(null)} style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={14} color="#64748b" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {messages.map(msg => {
                  const isMe = msg.sender_id === user.id;
                  const roleBadge = ROLE_BADGE[msg.sender_role];
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{isMe ? 'Vous' : msg.sender_name}</span>
                        {roleBadge && !isMe && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: roleBadge.bg, color: roleBadge.color }}>{roleBadge.label}</span>}
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDateTime(msg.created_at)}</span>
                      </div>
                      <div style={{ maxWidth: '75%', padding: '10px 16px', borderRadius: 14, background: isMe ? 'var(--rb-primary, #047857)' : '#f1f5f9', color: isMe ? '#fff' : '#0f172a', fontSize: 14, lineHeight: 1.6, borderBottomRightRadius: isMe ? 4 : 14, borderBottomLeftRadius: isMe ? 14 : 4 }}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 12 }}>
                <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} placeholder="Écrire un message..." style={{ flex: 1, padding: '10px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, color: '#0f172a' }} />
                <button onClick={handleSend} disabled={sending || !newMessage.trim()} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', background: newMessage.trim() ? 'var(--rb-primary, #047857)' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.7 : 1 }}>
                  <Send size={18} color={newMessage.trim() ? '#fff' : '#94a3b8'} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
              <MessageCircle size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
              <p style={{ fontSize: 16, fontWeight: 500 }}>Sélectionnez une conversation</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>ou créez-en une nouvelle</p>
            </div>
          )}
        </div>
      </div>

      {/* New conversation modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setShowNew(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 20, padding: 32, width: 520, maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Nouvelle conversation</h3>
              <button onClick={() => setShowNew(false)} style={{ background: '#f1f5f9', border: 'none', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color="#64748b" /></button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Sujet *</label>
              <input value={newConvForm.subject} onChange={e => setNewConvForm(f => ({ ...f, subject: e.target.value }))} placeholder="Objet de la conversation" style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Participants * ({newConvForm.participant_ids.length})</label>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '2px solid #e2e8f0', borderRadius: 12, padding: 8 }}>
                {availableUsers.map(u => {
                  const selected = newConvForm.participant_ids.includes(u.id);
                  const badge = ROLE_BADGE[u.role];
                  return (
                    <div key={u.id} onClick={() => toggleParticipant(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: selected ? '#eef2ff' : '#fff', border: selected ? '1px solid #c7d2fe' : '1px solid transparent', marginBottom: 4 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected ? '#6366f1' : '#d1d5db'}`, background: selected ? '#6366f1' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700, flexShrink: 0 }}>{selected ? '✓' : ''}</div>
                      <span style={{ fontWeight: 500, color: '#0f172a', fontSize: 14 }}>{u.full_name}</span>
                      {badge && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>}
                      {u.partner_name && <span style={{ fontSize: 11, color: '#94a3b8' }}>({u.partner_name})</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Premier message *</label>
              <textarea value={newConvForm.message} onChange={e => setNewConvForm(f => ({ ...f, message: e.target.value }))} placeholder="Votre message..." rows={4} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <button onClick={handleCreateConversation} disabled={creating || !newConvForm.subject.trim() || !newConvForm.message.trim() || newConvForm.participant_ids.length === 0} style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'var(--rb-primary, #047857)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Création...' : 'Démarrer la conversation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
