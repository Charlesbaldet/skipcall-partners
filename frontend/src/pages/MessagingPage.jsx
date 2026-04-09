import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../lib/api';
import { fmtDateTime } from '../lib/constants';
import { MessageCircle, Plus, Send, X, Archive, Trash2, Users } from 'lucide-react';

const ROLE_BADGE = {
  admin: { label: 'Admin', color: '#dc2626', bg: '#fef2f2' },
  commercial: { label: 'Commercial', color: '#0891b2', bg: '#ecfeff' },
  partner: { label: 'Partenaire', color: 'var(--rb-primary, #059669)', bg: '#eef2ff' },
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
    <div style={{ position: 'fixed', inset: 0, background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Messages</h1>
      </div>

      {/* Main: sidebar + chat */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* SIDEBAR */}
        <div style={{ width: 340, borderRight: '1px solid #e2e8f0', background: 'white', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, borderBottom: '1px solid #f1f5f9' }}>
            <button onClick={openNewConversation} style={{ width: '100%', padding: '10px 16px', background: '#059669', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>+ Nouvelle conversation</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Chargement...</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Aucune conversation</div>
            ) : (
              conversations.map(conv => (
                <div key={conv.id} onClick={() => openConversation(conv)} style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: activeConv?.id === conv.id ? '#ecfdf5' : 'transparent', borderLeft: activeConv?.id === conv.id ? '3px solid #059669' : '3px solid transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.partner_name || conv.subject || 'Sans nom'}</div>
                    {conv.unread_count > 0 && (
                      <div style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#059669', color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{conv.unread_count}</div>
                    )}
                  </div>
                  {conv.subject && conv.partner_name && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.subject}</div>
                  )}
                  {conv.last_message && (
                    <div style={{ fontSize: 13, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.last_message_by ? <span style={{ fontWeight: 600 }}>{conv.last_message_by}: </span> : null}{conv.last_message}</div>
                  )}
                  {conv.last_message_at && (
                    <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>{timeAgo(conv.last_message_at)}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* CHAT AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!activeConv ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Sélectionnez une conversation</div>
                <div style={{ fontSize: 14 }}>Ou créez-en une nouvelle pour commencer</div>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div style={{ padding: '14px 24px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{activeConv.partner_name || activeConv.subject || 'Conversation'}</div>
                  {participants.length > 0 && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{participants.map(p => p.full_name).join(', ')}</div>
                  )}
                </div>
                <button onClick={() => setDeleteConfirm(activeConv)} style={{ padding: 8, background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', borderRadius: 8, fontSize: 18 }} title="Supprimer la conversation">🗑️</button>
              </div>

              {/* Messages container with autoscroll */}
              <div ref={(el) => { if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f8fafc' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 13 }}>Aucun message. Écrivez le premier !</div>
                ) : (
                  (() => {
                    let lastDate = null;
                    return messages.map(msg => {
                      const msgDate = new Date(msg.created_at).toDateString();
                      const showDateSep = msgDate !== lastDate;
                      lastDate = msgDate;
                      const isOwn = msg.sender_id === user?.id;
                      return (
                        <div key={msg.id}>
                          {showDateSep && (
                            <div style={{ textAlign: 'center', margin: '16px 0 12px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                              {new Date(msg.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                            <div style={{ maxWidth: '70%', display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: isOwn ? 'row-reverse' : 'row' }}>
                              {!isOwn && (
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{(msg.sender_name || '?').charAt(0).toUpperCase()}</div>
                              )}
                              <div>
                                {!isOwn && (
                                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2, marginLeft: 4 }}>{msg.sender_name}</div>
                                )}
                                <div style={{ padding: '10px 14px', borderRadius: 16, background: isOwn ? '#059669' : 'white', color: isOwn ? 'white' : '#0f172a', border: isOwn ? 'none' : '1px solid #e2e8f0', fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', boxShadow: isOwn ? '0 1px 2px rgba(5,150,105,0.15)' : '0 1px 2px rgba(0,0,0,0.04)' }}>{msg.content}</div>
                                <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2, textAlign: isOwn ? 'right' : 'left' }}>{new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              {/* Input bar */}
              <div style={{ padding: '14px 24px', background: 'white', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Écrivez votre message... (Entrée pour envoyer)" rows={1} style={{ flex: 1, padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, resize: 'none', fontFamily: 'inherit', outline: 'none', maxHeight: 120, lineHeight: 1.4, boxSizing: 'border-box' }} />
                  <button onClick={handleSend} disabled={sending || !newMessage.trim()} style={{ padding: '12px 20px', background: '#059669', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: (sending || !newMessage.trim()) ? 'not-allowed' : 'pointer', opacity: (sending || !newMessage.trim()) ? 0.5 : 1, whiteSpace: 'nowrap' }}>{sending ? '...' : 'Envoyer'}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New conversation modal */}
      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 500, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Nouvelle conversation</h2>
            <input type="text" value={newConvForm.subject} onChange={e => setNewConvForm({ ...newConvForm, subject: e.target.value })} placeholder="Sujet (optionnel)" style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 12, fontSize: 14, boxSizing: 'border-box' }} />
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#475569' }}>Participants</div>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 12 }}>
              {availableUsers.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Aucun utilisateur disponible</div>
              ) : (
                availableUsers.map(u => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newConvForm.participant_ids.includes(u.id)} onChange={() => toggleParticipant(u.id)} />
                    <span style={{ fontSize: 14, color: '#0f172a' }}>{u.full_name}</span>
                  </label>
                ))
              )}
            </div>
            <textarea value={newConvForm.message} onChange={e => setNewConvForm({ ...newConvForm, message: e.target.value })} placeholder="Votre premier message..." rows={3} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 16, fontSize: 14, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNew(false)} style={{ padding: '10px 18px', background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleCreateConversation} disabled={creating || newConvForm.participant_ids.length === 0 || !newConvForm.message.trim()} style={{ padding: '10px 18px', background: '#059669', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: (creating || newConvForm.participant_ids.length === 0 || !newConvForm.message.trim()) ? 'not-allowed' : 'pointer', opacity: (creating || newConvForm.participant_ids.length === 0 || !newConvForm.message.trim()) ? 0.5 : 1 }}>{creating ? 'Création...' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 400, width: '90%' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Supprimer la conversation ?</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b' }}>Cette action est définitive. Tous les messages seront perdus.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: '10px 18px', background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} style={{ padding: '10px 18px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Supprimer</button>
            </div>
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
