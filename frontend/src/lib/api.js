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
      // Proxy endpoints (e.g. /crm/hubspot/fields) can return 401 when
      // the *upstream* OAuth token is expired — that's not a RefBoost
      // session problem, so don't log the user out. Surface a regular
      // error and let the caller decide how to handle it.
      const isProxy401 = finalPath.startsWith('/crm/');
      if (isProxy401) {
        let msg = 'Erreur intégration';
        try {
          const body = await res.clone().json();
          if (body && body.error) msg = body.error;
        } catch {}
        const err = new Error(msg);
        err.status = 401;
        throw err;
      }
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
    // Content-Type-aware parsing. If something upstream (Vercel
    // fallback during a backend deploy, a 404 from a missing route, a
    // reverse proxy returning an error page) serves HTML instead of
    // JSON, `res.json()` blows up with "Unexpected token '<'" and the
    // caller sees a cryptic parse error. Detect that up front and
    // throw a clean message instead.
    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      try { data = await res.json(); }
      catch {
        const err = new Error('Réponse serveur invalide');
        err.status = res.status;
        throw err;
      }
    } else {
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        const err = new Error(
          text.startsWith('<') || text.includes('<!DOCTYPE')
            ? 'Service indisponible — réessayez dans quelques secondes'
            : (text || 'Erreur serveur')
        );
        err.status = res.status;
        throw err;
      }
      // 2xx non-JSON — rare, surface the raw body so callers can act.
      return text;
    }
    if (!res.ok) {
      // Preserve the full response payload on the Error so callers can
      // act on structured fields (e.g. partner_limit_reached exposes
      // `limit`, `plan`, `upgradeTo` for the upgrade modal).
      const err = new Error(data.error || 'Erreur serveur');
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Auth
  async login(email, password) {
    const data = await this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setToken(data.token); this.setUser(data.user); return data;
  }
  async loginWithGoogle(accessToken) {
    const data = await this.request('/auth/google', { method: 'POST', body: JSON.stringify({ access_token: accessToken }) });
    if (data.token) { this.setToken(data.token); this.setUser(data.user); }
    return data;
  }
  async signupWithGoogle({ company, fullName, phone, access_token }) {
    const data = await this.request('/auth/signup-google', {
      method: 'POST',
      body: JSON.stringify({ company, fullName, phone, access_token }),
    });
    if (data.token) { this.setToken(data.token); this.setUser(data.user); }
    return data;
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
  approveCommission(id) { return this.request('/commissions/' + id + '/approve', { method: 'POST' }); }
  rejectCommission(id, reason) { return this.request('/commissions/' + id + '/reject', { method: 'POST', body: JSON.stringify({ reason }) }); }

  // Dashboard
  getKPIs() { return this.request('/dashboard/kpis'); }
  getTimeline(months = 6) { return this.request(`/dashboard/timeline?months=${months}`); }
  getDashboardStats() { return this.request('/dashboard/stats'); }
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
  previewEmailTemplate(key) { return this.request('/settings/notification-preferences/preview/' + encodeURIComponent(key)); }

  // Tenant feature flags (tracking opt-ins)
  getTenantFeatures() { return this.request('/tenants/features'); }
  updateTenantFeatures(data) { return this.request('/tenants/features', { method: 'PUT', body: JSON.stringify(data) }); }

  // Referral links
  getPartnerReferralLink(partnerId) { return this.request('/referral-links/partners/' + partnerId); }
  regenerateReferralCode(partnerId) { return this.request('/referral-links/partners/' + partnerId + '/regenerate', { method: 'POST' }); }
  getReferralClickStats() { return this.request('/referral-links/click-stats'); }
  getReferralSourceBreakdown() { return this.request('/referral-links/source-breakdown'); }

  // Promo codes
  getPromoCodes() { return this.request('/promo-codes'); }
  getPartnerPromoCodes() { return this.request('/promo-codes/partner'); }
  createPromoCode(data) { return this.request('/promo-codes', { method: 'POST', body: JSON.stringify(data) }); }
  updatePromoCode(id, data) { return this.request('/promo-codes/' + id, { method: 'PUT', body: JSON.stringify(data) }); }
  deletePromoCode(id) { return this.request('/promo-codes/' + id, { method: 'DELETE' }); }
  validatePromoCode(code, tenantSlug) { return this.request('/promo-codes/validate', { method: 'POST', body: JSON.stringify({ code, tenantSlug }) }); }

  // Partner categories
  getPartnerCategories() { return this.request('/partner-categories'); }
  getPublicPartnerCategories(tenantSlug) { return this.request('/partner-categories/public?tenant=' + encodeURIComponent(tenantSlug)); }
  createPartnerCategory(data) { return this.request('/partner-categories', { method: 'POST', body: JSON.stringify(data) }); }
  updatePartnerCategory(id, data) { return this.request('/partner-categories/' + id, { method: 'PUT', body: JSON.stringify(data) }); }
  deletePartnerCategory(id) { return this.request('/partner-categories/' + id, { method: 'DELETE' }); }
  reorderPartnerCategories(categories) { return this.request('/partner-categories/reorder', { method: 'PUT', body: JSON.stringify({ categories }) }); }
  setDefaultPartnerCategory(id) { return this.request('/partner-categories/' + id + '/set-default', { method: 'PUT' }); }

  // Billing (Stripe)
  getBillingPlan() { return this.request('/billing/plan'); }
  syncBilling() { return this.request('/billing/sync'); }
  previewPlanChange(priceId) { return this.request('/billing/preview-change?priceId=' + encodeURIComponent(priceId)); }
  cleanupSubscriptions() { return this.request('/billing/cleanup'); }
  createCheckout(priceId) { return this.request('/billing/checkout', { method: 'POST', body: JSON.stringify({ priceId }) }); }
  createPortal() { return this.request('/billing/portal', { method: 'POST' }); }
  cancelSubscription() { return this.request('/billing/cancel', { method: 'POST' }); }
  reactivateSubscription() { return this.request('/billing/reactivate', { method: 'POST' }); }

  // CRM integrations
  getCrmIntegrations() { return this.request('/crm/integrations'); }
  createCrmIntegration(data) { return this.request('/crm/integrations', { method: 'POST', body: JSON.stringify(data) }); }
  deleteCrmIntegration(id) { return this.request('/crm/integrations/' + id, { method: 'DELETE' }); }
  testCrmWebhook(id) { return this.request('/crm/integrations/' + id + '/test', { method: 'POST' }); }
  getCrmMappings(id) { return this.request('/crm/mappings/' + id); }
  updateCrmMappings(id, data) { return this.request('/crm/mappings/' + id, { method: 'PUT', body: JSON.stringify(data) }); }
  syncReferralToCrm(referralId) { return this.request('/crm/sync/' + referralId, { method: 'POST' }); }
  getCrmSyncLog() { return this.request('/crm/sync/log'); }
  getHubspotAuthUrl() { return this.request('/crm/hubspot/auth'); }
  disconnectHubspot() { return this.request('/crm/hubspot/disconnect', { method: 'POST' }); }
  getSalesforceAuthUrl() { return this.request('/crm/salesforce/auth'); }
  disconnectSalesforce() { return this.request('/crm/salesforce/disconnect', { method: 'POST' }); }
  getHubspotFields() { return this.request('/crm/hubspot/fields'); }
  getHubspotPipelines() { return this.request('/crm/hubspot/pipelines'); }

  // Notion
  getNotionStatus() { return this.request('/crm/notion/status'); }
  connectNotion(data) { return this.request('/crm/notion/connect', { method: 'POST', body: JSON.stringify(data) }); }
  disconnectNotion() { return this.request('/crm/notion/disconnect', { method: 'POST' }); }
  getNotionProperties() { return this.request('/crm/notion/properties'); }
  getNotionMappings() { return this.request('/crm/notion/mappings'); }
  updateNotionMappings(mappings) { return this.request('/crm/notion/mappings', { method: 'PUT', body: JSON.stringify({ mappings }) }); }
  syncReferralToNotion(referralId) { return this.request('/crm/notion/sync/' + referralId, { method: 'POST' }); }
  pullFromNotion() { return this.request('/crm/notion/pull', { method: 'POST' }); }
  getSalesforceFields() { return this.request('/crm/salesforce/fields'); }
  getSalesforceStages() { return this.request('/crm/salesforce/stages'); }

  // Pipeline stages (custom per-tenant Kanban columns)
  getPipelineStages() { return this.request('/pipeline-stages'); }
  createPipelineStage(data) { return this.request('/pipeline-stages', { method: 'POST', body: JSON.stringify(data) }); }
  updatePipelineStage(id, data) { return this.request('/pipeline-stages/' + id, { method: 'PUT', body: JSON.stringify(data) }); }
  deletePipelineStage(id) { return this.request('/pipeline-stages/' + id, { method: 'DELETE' }); }
  reorderPipelineStages(stages) { return this.request('/pipeline-stages/reorder', { method: 'PUT', body: JSON.stringify({ stages }) }); }

  // Global search
  globalSearch(query) { return this.request('/search?q=' + encodeURIComponent(query)); }
  getInvoices() { return this.request('/billing/invoices'); }
}

export const api = new ApiClient();
export default api;
