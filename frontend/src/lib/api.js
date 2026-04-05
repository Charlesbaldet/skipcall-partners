const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('skipcall_token');
  }

  setToken(token) {
    this.token = token;
    if (token) { localStorage.setItem('skipcall_token', token); }
    else { localStorage.removeItem('skipcall_token'); }
  }

  getUser() {
    const data = localStorage.getItem('skipcall_user');
    return data ? JSON.parse(data) : null;
  }

  setUser(user) {
    if (user) { localStorage.setItem('skipcall_user', JSON.stringify(user)); }
    else { localStorage.removeItem('skipcall_user'); }
  }

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) { headers['Authorization'] = `Bearer ${this.token}`; }
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.status === 401) { this.setToken(null); this.setUser(null); window.location.href = '/login'; throw new Error('Session expirée'); }
    const data = await res.json();
    if (!res.ok) { throw new Error(data.error || 'Erreur serveur'); }
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setToken(data.token); this.setUser(data.user); return data;
  }
  logout() { this.setToken(null); this.setUser(null); }
  getMe() { return this.request('/auth/me'); }
  changePassword(currentPassword, newPassword) { return this.request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }); }

  getPartners() { return this.request('/partners'); }
  getPartner(id) { return this.request(`/partners/${id}`); }
  createPartner(data) { return this.request('/partners', { method: 'POST', body: JSON.stringify(data) }); }
  updatePartner(id, data) { return this.request(`/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  archivePartner(id) { return this.request(`/partners/${id}/archive`, { method: 'PUT' }); }
  deletePartner(id) { return this.request(`/partners/${id}`, { method: 'DELETE' }); }
  getMyPartnerProfile() { return this.request('/partners/me/profile'); }
  updateMyIban(id, data) { return this.request(`/partners/${id}/iban`, { method: 'PUT', body: JSON.stringify(data) }); }

  getReferrals(params = {}) { const qs = new URLSearchParams(params).toString(); return this.request(`/referrals?${qs}`); }
  getReferral(id) { return this.request(`/referrals/${id}`); }
  createReferral(data) { return this.request('/referrals', { method: 'POST', body: JSON.stringify(data) }); }
  updateReferral(id, data) { return this.request(`/referrals/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  deleteReferral(id) { return this.request(`/referrals/${id}`, { method: 'DELETE' }); }

  getCommissions(params = {}) { const qs = new URLSearchParams(params).toString(); return this.request(`/commissions?${qs}`); }
  getCommissionsSummary() { return this.request('/commissions/summary'); }
  updateCommission(id, status) { return this.request(`/commissions/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }); }

  getKPIs() { return this.request('/dashboard/kpis'); }
  getTimeline(months = 6) { return this.request(`/dashboard/timeline?months=${months}`); }
  getPipeline() { return this.request('/dashboard/pipeline'); }
  getTopPartners() { return this.request('/dashboard/top-partners'); }
  getLevels() { return this.request('/dashboard/levels'); }

  getConversations() { return this.request('/messages/conversations'); }
  createConversation(data) { return this.request('/messages/conversations', { method: 'POST', body: JSON.stringify(data) }); }
  getMessages(conversationId) { return this.request(`/messages/conversations/${conversationId}/messages`); }
  sendMessage(conversationId, content) { return this.request(`/messages/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }); }
  getUnreadCount() { return this.request('/messages/unread'); }
  getMessageableUsers() { return this.request('/messages/users'); }

  getApplications(s) { return this.request('/applications?status=' + (s || 'pending')); }
  approveApplication(id, r) { return this.request('/applications/' + id + '/approve', { method: 'PUT', body: JSON.stringify({ commission_rate: r }) }); }
  rejectApplication(id, r) { return this.request('/applications/' + id + '/reject', { method: 'PUT', body: JSON.stringify({ reason: r }) }); }

  getAdminUsers() { return this.request('/admin/users'); }
  inviteUser(d) { return this.request('/admin/invite', { method: 'POST', body: JSON.stringify(d) }); }
  getInvitations() { return this.request('/admin/invitations'); }
  updateAdminUser(id, d) { return this.request('/admin/users/' + id, { method: 'PUT', body: JSON.stringify(d) }); }
  deleteInvitation(id) { return this.request('/admin/invitations/' + id, { method: 'DELETE' }); }
}

export const api = new ApiClient();
export default api;
