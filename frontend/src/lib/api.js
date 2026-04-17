import i18n from '../i18n';

const API_BASE = '/api';

class ApiClient {
  constructor() { this.token = localStorage.getItem('skipcall_token'); }

  setToken(token) {
    this.token = token;
    if (token) { localStorage.setItem('skipcall_token', token); } else { localStorage.removeItem('skipcall_token'); }
  }

  getUser() { const data = localStorage.getItem('skipcall_user'); return data ? JSON.parse(data) : null; }
  setUser(user) { if (user) { localStorage.setItem('skipcall_user', JSON.stringify(user)); } else { localStorage.removeItem('skipcall_user'); } }

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) { headers['Authorization'] = `Bearer ${this.token}`; }
    // Send the current UI language so the backend can return localized
    // dynamic content. Normalize `es-ES` → `es`. Also append ?lang=<x>
    // to the URL so browser and CDN caches key by language (the backend
    // already prefers req.query.lang over Accept-Language when present).
    const primaryLang = (i18n?.language || '').slice(0, 2).toLowerCase();
    let finalPath = path;
    if (primaryLang) {
      if (!headers['Accept-Language']) headers['Accept-Language'] = primaryLang;
      if (!/[?&]lang=/.test(finalPath)) {
        finalPath += (finalPath.includes('?') ? '&' : '?') + 'lang=' + primaryLang;
      }
    }
    const res = await fetch(`${API_BASE}${finalPath}`, { ...options, headers });
    if (res.status === 401) {
      this.setToken(null);
      this.setUser(null);
      // Peek at the body to detect the access-revoked signal from the
      // backend — when a partner has been archived/deleted we redirect
      // to /login?revoked=1 so the login page shows a clear message.
      let revoked = false;
      try {
        const clone = res.clone();
        const body = await clone.json();
        if (body && (body.revoked || body.error === 'access_revoked')) revoked = true;
      } catch { /* non-JSON body, ignore */ }
      // Don't redirect if we're already on a public marketing/auth page
      // (avoids kicking unauthenticated visitors off the landing site).
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const isPublicPath =
        path === '/' ||
        path === '/login' ||
        path === '/signup' ||
        path === '/forgot-password' ||
        path === '/reset-password' ||
        path.startsWith('/apply') ||
        path.startsWith('/r/') ||
        path.startsWith('/ref/') ||
        path.startsWith('/setup-password/') ||
        path.startsWith('/marketplace') ||
        path.startsWith('/blog') ||
        path.startsWith('/fonctionnalites/');
      if (!isPublicPath && typeof window !== 'undefined') {
        window.location.href = '/login' + (revoked ? '?revoked=1' : '');
      }
      throw new Error(revoked ? 'access_revoked' : 'Session expirée');
    }
    const data = await res.json();
    if (!res.ok) { throw new Error(data.error || 'Erreur serveur'); }
    return data;
  }

  // Auth
  async login(email, password) {
    const data = await this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setToken(data.token); this.setUser(data.user); return data;
  }
  async loginWithGoogle(credential) {
    const data = await this.request('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });
    this.setToken(data.token); this.setUser(data.user); return data;
  }
  logout() { this.setToken(null); this.setUser(null); }
  getMe() { return this.request('/auth/me'); }
  changePassword(currentPassword, newPassword) { return this.request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }); }
  // Phase B: multi-role space switcher
  getMySpaces() { return this.request('/auth/me/spaces'); }
  switchSpace(body) { return this.request('/auth/switch-space', { method: 'POST', body: JSON.stringify(body) }); }

  // Partners
  getPartners() { return this.request('/partners'); }
  getPartner(id) { return this.request(`/partners/${id}`); }
  createPartner(data) { return this.request('/partners', { method: 'POST', body: JSON.stringify(data) }); }
  updatePartner(id, data) { return this.request(`/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  archivePartner(id) { return this.request(`/partners/${id}/archive`, { method: 'PUT' }); }
  deletePartner(id) { return this.request(`/partners/${id}`, { method: 'DELETE' }); }
  getMyPartnerProfile() { return this.request('/partners/me/profile'); }
  updateMyIban(id, data) { return this.request(`/partners/${id}/iban`, { method: 'PUT', body: JSON.stringify(data) }); }

  // Referrals
  getReferrals(params = {}) { const qs = new URLSearchParams(params).toString(); return this.request(`/referrals?${qs}`); }
  getReferral(id) { return this.request(`/referrals/${id}`); }
  createReferral(data) { return this.request('/referrals', { method: 'POST', body: JSON.stringify(data) }); }
  updateReferral(id, data) { return this.request(`/referrals/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  deleteReferral(id) { return this.request(`/referrals/${id}`, { method: 'DELETE' }); }

  // Commissions
  getCommissions(params = {}) { const qs = new URLSearchParams(params).toString(); return this.request(`/commissions?${qs}`); }
  getCommissionsSummary() { return this.request('/commissions/summary'); }
  updateCommission(id, status) { return this.request(`/commissions/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }); }

  // Dashboard
  getKPIs() { return this.request('/dashboard/kpis'); }
  getTimeline(months = 6) { return this.request(`/dashboard/timeline?months=${months}`); }
  getPipeline() { return this.request('/dashboard/pipeline'); }
  getTopPartners() { return this.request('/dashboard/top-partners'); }
  getLevels() { return this.request('/dashboard/levels'); }

  // Messages
  getConversations() { return this.request('/messages/conversations'); }
  createConversation(data) { return this.request('/messages/conversations', { method: 'POST', body: JSON.stringify(data) }); }
  getMessages(conversationId) { return this.request(`/messages/conversations/${conversationId}/messages`); }
  sendMessage(conversationId, content) { return this.request(`/messages/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }); }
  getUnreadCount() { return this.request('/messages/unread'); }
  getMessageableUsers() { return this.request('/messages/users'); }

  // Applications
  getApplications(s) { return this.request('/applications?status=' + (s || 'pending')); }
  approveApplication(id, r) { return this.request('/applications/' + id + '/approve', { method: 'PUT', body: JSON.stringify({ commission_rate: r }) }); }
  rejectApplication(id, r) { return this.request('/applications/' + id + '/reject', { method: 'PUT', body: JSON.stringify({ reason: r }) }); }
  deleteApplication(id) { return this.request('/applications/' + id, { method: 'DELETE' }); }

  // Admin
  getAdminUsers() { return this.request('/admin/users'); }
  inviteUser(d) { return this.request('/admin/invite', { method: 'POST', body: JSON.stringify(d) }); }
  getInvitations() { return this.request('/admin/invitations'); }
  updateAdminUser(id, d) { return this.request('/admin/users/' + id, { method: 'PUT', body: JSON.stringify(d) }); }
  deleteInvitation(id) { return this.request('/admin/invitations/' + id, { method: 'DELETE' }); }

  // API Keys (v4)
  getApiKeys() { return this.request('/admin/api-keys'); }
  createApiKey(data) { return this.request('/admin/api-keys', { method: 'POST', body: JSON.stringify(data) }); }
  revokeApiKey(id) { return this.request('/admin/api-keys/' + id, { method: 'DELETE' }); }

  // Leaderboard
  getLeaderboard() { return this.request('/leaderboard'); }

  // Tenant (current user's tenant)
  getMyTenant() { return this.request('/tenants/me'); }

  // Programme (tenant levels)
  getTenantLevels() { return this.request('/levels'); }
  createTenantLevel(data) { return this.request('/levels', { method: 'POST', body: JSON.stringify(data) }); }
  updateTenantLevel(id, data) { return this.request('/levels/' + id, { method: 'PUT', body: JSON.stringify(data) }); }
  deleteTenantLevel(id) { return this.request('/levels/' + id, { method: 'DELETE' }); }
  resetTenantLevels() { return this.request('/levels/reset', { method: 'POST' }); }
  setTenantLevelThresholdType(type) { return this.request('/levels/threshold-type', { method: 'POST', body: JSON.stringify({ type }) }); }
  getTenantBySlug(slug) { return this.request('/tenants/public/' + slug); }

  updateMyTenant(data) {
    const u = this.getUser() || {};
    let tenantId = u.tenantId;
    if (!tenantId && this.token) {
      try {
        const payload = JSON.parse(atob(this.token.split('.')[1]));
        tenantId = payload.tenantId;
      } catch(e) {}
    }
    if (!tenantId) return Promise.reject(new Error('Pas de tenant ID'));
    return this.request('/tenants/' + tenantId, { method: 'PUT', body: JSON.stringify(data) });
  }


  // Marketplace
  getMarketplace(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('/marketplace' + (qs ? '?' + qs : ''));
  }
  getMarketplaceSectors() { return this.request('/marketplace/sectors'); }
  getMarketplaceSettings() { return this.request('/marketplace/settings'); }
  updateMarketplaceSettings(data) {
    return this.request('/marketplace/settings', { method: 'PATCH', body: JSON.stringify(data) });
  }

  // News (admin)
  getNews() { return this.request('/news'); }
  createNews(data) { return this.request('/news', { method: 'POST', body: JSON.stringify(data) }); }
  updateNews(id, data) { return this.request('/news/' + id, { method: 'PUT', body: JSON.stringify(data) }); }
  deleteNews(id) { return this.request('/news/' + id, { method: 'DELETE' }); }
  addNewsAttachment(id, data) { return this.request('/news/' + id + '/attachments', { method: 'POST', body: JSON.stringify(data) }); }
  deleteNewsAttachment(id) { return this.request('/news/attachments/' + id, { method: 'DELETE' }); }
  getNewsStats(id) { return this.request('/news/' + id + '/stats'); }
  getNewsEngagement() { return this.request('/news/engagement'); }
  getSocials() { return this.request('/partners/social'); }
  updateSocials(data) { return this.request('/partners/social', { method: 'PUT', body: JSON.stringify(data) }); }

  // News (partner)
  getPartnerNews() { return this.request('/partner/news'); }
  getPartnerNewsPost(id) { return this.request('/partner/news/' + id); }
  getProgramSocials(tenantId) { return this.request('/partner/program/' + tenantId + '/socials'); }

  // Notifications
  getNotifications() { return this.request('/notifications'); }
  markNotificationRead(id) { return this.request('/notifications/' + id + '/read', { method: 'PUT' }); }
  markAllNotificationsRead() { return this.request('/notifications/read-all', { method: 'PUT' }); }
  getUnreadNotificationCount() { return this.request('/notifications/unread-count'); }
  getUnreadByCategory() { return this.request('/notifications/unread-by-category'); }
  markCategoryRead(category) { return this.request('/notifications/mark-category-read/' + category, { method: 'PUT' }); }

  // Notification preferences (admin)
  getNotificationPreferences() { return this.request('/settings/notification-preferences'); }
  updateNotificationPreferences(data) { return this.request('/settings/notification-preferences', { method: 'PUT', body: JSON.stringify(data) }); }
}

export const api = new ApiClient();
export default api;
