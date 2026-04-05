const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.status === 401) { this.setToken(null); window.location.href = '/login'; return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  }

  get(path) { return this.request(path); }
  post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }); }
  put(path, body) { return this.request(path, { method: 'PUT', body: JSON.stringify(body) }); }
  del(path) { return this.request(path, { method: 'DELETE' }); }

  // ─── Auth ───
  login(email, password) { return this.post('/auth/login', { email, password }); }
  getMe() { return this.get('/auth/me'); }
  changePassword(currentPassword, newPassword) { return this.put('/auth/password', { currentPassword, newPassword }); }

  // ─── Dashboard ───
  getDashboard() { return this.get('/dashboard'); }
  getPartnerDashboard() { return this.get('/dashboard/partner'); }

  // ─── Partners ───
  getPartners() { return this.get('/partners'); }
  getPartner(id) { return this.get(`/partners/${id}`); }
  createPartner(data) { return this.post('/partners', data); }
  updatePartner(id, data) { return this.put(`/partners/${id}`, data); }
  archivePartner(id) { return this.put(`/partners/${id}/archive`); }
  reactivatePartner(id) { return this.put(`/partners/${id}/reactivate`); }
  updatePartnerIban(id, data) { return this.put(`/partners/${id}/iban`, data); }
  getMyProfile() { return this.get('/partners/me/profile'); }

  // ─── Referrals ───
  getReferrals(params) {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/referrals${q}`);
  }
  createReferral(data) { return this.post('/referrals', data); }
  updateReferral(id, data) { return this.put(`/referrals/${id}`, data); }
  deleteReferral(id) { return this.del(`/referrals/${id}`); }

  // ─── Commissions ───
  getCommissions(params) {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/commissions${q}`);
  }
  updateCommission(id, data) { return this.put(`/commissions/${id}`, data); }

  // ─── Messages ───
  getConversations() { return this.get('/messages/conversations'); }
  getConversation(id) { return this.get(`/messages/conversations/${id}`); }
  createConversation(data) { return this.post('/messages/conversations', data); }
  sendMessage(conversationId, content) { return this.post(`/messages/conversations/${conversationId}/messages`, { content }); }
  markAsRead(conversationId) { return this.put(`/messages/conversations/${conversationId}/read`); }
  getUnreadCount() { return this.get('/messages/unread-count'); }

  // ─── Applications (v3) ───
  getApplications(status = 'pending') { return this.get(`/applications?status=${status}`); }
  approveApplication(id, commissionRate) { return this.put(`/applications/${id}/approve`, { commission_rate: commissionRate }); }
  rejectApplication(id, reason) { return this.put(`/applications/${id}/reject`, { reason }); }

  // ─── Admin Settings (v3) ───
  getAdminUsers() { return this.get('/admin/users'); }
  inviteUser(data) { return this.post('/admin/invite', data); }
  getInvitations() { return this.get('/admin/invitations'); }
  updateAdminUser(id, data) { return this.put(`/admin/users/${id}`, data); }
  deleteInvitation(id) { return this.del(`/admin/invitations/${id}`); }
}

export const api = new ApiClient();
export default api;
