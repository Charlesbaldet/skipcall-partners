const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('skipcall_token');
    this.user = JSON.parse(localStorage.getItem('skipcall_user') || 'null');
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('skipcall_token', token);
    else localStorage.removeItem('skipcall_token');
  }

  getUser() { return this.user; }
  setUser(user) {
    this.user = user;
    if (user) localStorage.setItem('skipcall_user', JSON.stringify(user));
    else localStorage.removeItem('skipcall_user');
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('skipcall_token');
    localStorage.removeItem('skipcall_user');
  }

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const res = await fetch(API_BASE + path, { ...options, headers });
    if (res.status === 401) { this.logout(); window.location.href = '/login'; return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  }

  get(p) { return this.request(p); }
  post(p, b) { return this.request(p, { method: 'POST', body: JSON.stringify(b) }); }
  put(p, b) { return this.request(p, { method: 'PUT', body: JSON.stringify(b) }); }
  del(p) { return this.request(p, { method: 'DELETE' }); }

  async login(email, password) {
    const data = await this.post('/auth/login', { email, password });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  getMe() { return this.get('/auth/me'); }
  changePassword(c, n) { return this.put('/auth/password', { currentPassword: c, newPassword: n }); }
  getDashboard() { return this.get('/dashboard'); }
  getPartnerDashboard() { return this.get('/dashboard/partner'); }
  getPartners() { return this.get('/partners'); }
  getPartner(id) { return this.get('/partners/' + id); }
  createPartner(d) { return this.post('/partners', d); }
  updatePartner(id, d) { return this.put('/partners/' + id, d); }
  archivePartner(id) { return this.put('/partners/' + id + '/archive'); }
  reactivatePartner(id) { return this.put('/partners/' + id + '/reactivate'); }
  updatePartnerIban(id, d) { return this.put('/partners/' + id + '/iban', d); }
  getMyProfile() { return this.get('/partners/me/profile'); }
  getReferrals(p) { const q = p ? '?' + new URLSearchParams(p) : ''; return this.get('/referrals' + q); }
  createReferral(d) { return this.post('/referrals', d); }
  updateReferral(id, d) { return this.put('/referrals/' + id, d); }
  deleteReferral(id) { return this.del('/referrals/' + id); }
  getCommissions(p) { const q = p ? '?' + new URLSearchParams(p) : ''; return this.get('/commissions' + q); }
  updateCommission(id, d) { return this.put('/commissions/' + id, d); }
  getConversations() { return this.get('/messages/conversations'); }
  getConversation(id) { return this.get('/messages/conversations/' + id); }
  createConversation(d) { return this.post('/messages/conversations', d); }
  sendMessage(cid, content) { return this.post('/messages/conversations/' + cid + '/messages', { content }); }
  markAsRead(cid) { return this.put('/messages/conversations/' + cid + '/read'); }
  getUnreadCount() { return this.get('/messages/unread-count'); }
  getApplications(s) { return this.get('/applications?status=' + (s || 'pending')); }
  approveApplication(id, r) { return this.put('/applications/' + id + '/approve', { commission_rate: r }); }
  rejectApplication(id, r) { return this.put('/applications/' + id + '/reject', { reason: r }); }
  getAdminUsers() { return this.get('/admin/users'); }
  inviteUser(d) { return this.post('/admin/invite', d); }
  getInvitations() { return this.get('/admin/invitations'); }
  updateAdminUser(id, d) { return this.put('/admin/users/' + id, d); }
  deleteInvitation(id) { return this.del('/admin/invitations/' + id); }
}

const api = new ApiClient();
export default api;
