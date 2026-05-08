import i18n from '../i18n';

const API_BASE = '/api';

// Build a `start_date=…&end_date=…` querystring suffix from a
// {startDate,endDate} object. `sep` is '?' for endpoints with no query
// string, '&' for endpoints that already have one. Returns '' when the
// range is null/undefined.
function dateQS(range, sep = '?') {
  if (!range || !range.startDate || !range.endDate) return '';
  return `${sep}start_date=${range.startDate}&end_date=${range.endDate}`;
}

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
    // Always store the token (it may be a short-lived selection token
    // that only authorizes /auth/me/spaces + /auth/switch-space).
    if (data.token) this.setToken(data.token);
    // Only persist the user blob when the login is fully resolved.
    // requiresSpaceSelection means we still need the picker — the
    // user payload at that point is intentionally minimal (no
    // tenantId yet) and would mislead useAuth's bootstrap path.
    if (data.user && !data.requiresSpaceSelection) this.setUser(data.user);
    return data;
  }
  async loginWithGoogle(accessToken) {
    const data = await this.request('/auth/google', { method: 'POST', body: JSON.stringify({ access_token: accessToken }) });
    if (data.token) this.setToken(data.token);
    if (data.user && !data.requiresSpaceSelection) this.setUser(data.user);
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
  // GDPR Article 17 — partner self-service account deletion. Soft
  // deletes the user + partner row, schedules a 30-day purge, and
  // sends a confirmation email. The frontend immediately clears the
  // local session and redirects.
  deleteAccount() { return this.request('/auth/delete-account', { method: 'POST' }); }
  // GDPR Article 20 — partner data portability. The endpoint sets
  // Content-Disposition: attachment so the response IS the file;
  // we fetch as a Blob (NOT JSON) so the browser preserves the
  // exact byte stream for the download trigger.
  async exportData() {
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}/partner/export-data`, { headers });
    if (!res.ok) {
      let msg = 'Erreur export';
      try {
        const body = await res.clone().json();
        if (body && body.error) msg = body.error;
      } catch {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/.exec(cd);
    const today = new Date().toISOString().slice(0, 10);
    const filename = match ? match[1] : `refboost-export-${today}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { ok: true, filename };
  }
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
  getMyBankInfo() { return this.request('/partner/bank-info'); }
  updateMyBankInfo(data) { return this.request('/partner/bank-info', { method: 'PUT', body: JSON.stringify(data) }); }

  // Qonto
  getQontoStatus() { return this.request('/integrations/qonto/status'); }
  getQontoConnectUrl() { return this.request('/integrations/qonto/connect'); }
  getQontoBankAccounts() { return this.request('/integrations/qonto/bank-accounts'); }
  selectQontoBankAccount(payload) { return this.request('/integrations/qonto/bank-account', { method: 'PUT', body: JSON.stringify(payload) }); }
  disconnectQonto() { return this.request('/integrations/qonto/disconnect', { method: 'POST' }); }

  // Qonto payments
  payCommissionViaQonto(id) { return this.request(`/commissions/${id}/pay-qonto`, { method: 'POST' }); }
  payCommissionsBulk(ids) { return this.request('/commissions/pay-bulk', { method: 'POST', body: JSON.stringify({ commission_ids: ids }) }); }
  pollQontoTransfers() { return this.request('/commissions/poll-qonto', { method: 'POST' }); }
  resetCommissionPayment(id) { return this.request(`/commissions/${id}/reset-payment`, { method: 'POST' }); }
  confirmCommissionSca(id) { return this.request(`/commissions/${id}/confirm-sca`, { method: 'POST' }); }

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
  deleteCommission(id, reason) { return this.request('/commissions/' + id, { method: 'DELETE', body: JSON.stringify({ reason }) }); }
  uploadCommissionInvoice(id, { filename, dataUrl }) {
    return this.request('/commissions/' + id + '/upload-invoice', {
      method: 'POST',
      body: JSON.stringify({ filename, data_url: dataUrl }),
    });
  }
  async downloadCommissionInvoice(id) {
    // Auth lives in the Authorization header, so a plain <a href> can't
    // open the protected route. Fetch the file ourselves, then trigger
    // a browser download from a blob URL.
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}/commissions/${id}/invoice`, { headers });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur téléchargement');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/.exec(cd);
    const fname = match ? match[1] : `invoice-${id}.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  // Returns { url, filename, blob } so the caller can embed in an
  // <iframe> for preview AND fall back to a download if the embed
  // fails. The caller MUST URL.revokeObjectURL(url) when done — the
  // blob URL leaks until then.
  async fetchCommissionInvoiceObjectUrl(id) {
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}/commissions/${id}/invoice`, { headers });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur chargement facture');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/.exec(cd);
    const filename = match ? match[1] : `invoice-${id}.pdf`;
    const url = URL.createObjectURL(blob);
    return { url, filename, blob };
  }

  // Dashboard. The optional `range` arg is `{startDate, endDate}` (ISO
  // YYYY-MM-DD) or null/undefined for "no filter".
  getKPIs(range)            { return this.request('/dashboard/kpis' + dateQS(range)); }
  getTimeline(months = 6, range) { return this.request(`/dashboard/timeline?months=${months}` + dateQS(range, '&')); }
  getDashboardStats(range)  { return this.request('/dashboard/stats' + dateQS(range)); }
  getPipeline(range)        { return this.request('/dashboard/pipeline' + dateQS(range)); }
  getTopPartners(range)     { return this.request('/dashboard/top-partners' + dateQS(range)); }
  getLevels(range)          { return this.request('/dashboard/levels' + dateQS(range)); }
  getLeadsEvolution(range)  { return this.request('/dashboard/leads-evolution' + dateQS(range)); }

  // Trash / Corbeille — admin/commercial only.
  getTrash()                     { return this.request('/trash'); }
  getTrashCount()                { return this.request('/trash/count'); }
  restoreTrashItem(type, id)     { return this.request(`/trash/${type}/${id}/restore`, { method: 'POST' }); }
  permanentlyDeleteTrashItem(type, id) { return this.request(`/trash/${type}/${id}/permanent`, { method: 'DELETE' }); }

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

  // Tenant billing details (Settings → Entreprise tab on admin
  // side, surfaced read-only on the partner /partner/payments
  // page so the partner can address their invoice).
  getBillingInfo()        { return this.request('/tenants/billing'); }
  updateBillingInfo(data) { return this.request('/tenants/billing', { method: 'PUT', body: JSON.stringify(data) }); }

  // Onboarding checklist — admin-only.
  getOnboardingStatus() { return this.request('/onboarding/status'); }
  dismissOnboarding()   { return this.request('/onboarding/dismiss', { method: 'POST' }); }

  // Pennylane (accounting) integration. Auto-creates supplier
  // invoices for approved commissions and marks them paid when the
  // matching Qonto SEPA transfer settles.
  getPennylaneStatus()           { return this.request('/pennylane/status'); }
  updatePennylaneSettings(body)  { return this.request('/pennylane/settings', { method: 'PUT', body: JSON.stringify(body) }); }
  disconnectPennylane()          { return this.request('/pennylane/disconnect', { method: 'DELETE' }); }

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
  // Marketplace WYSIWYG editor (admin) + public detail page.
  getMarketplacePage() { return this.request('/marketplace/page'); }
  updateMarketplacePage(payload) {
    return this.request('/marketplace/page', { method: 'PUT', body: JSON.stringify(payload) });
  }
  reorderMarketplaceBlocks(blocks) {
    return this.request('/marketplace/page/reorder', { method: 'POST', body: JSON.stringify({ blocks }) });
  }
  uploadMarketplaceReference({ name, description, dataUrl }) {
    return this.request('/marketplace/references/upload', {
      method: 'POST',
      body: JSON.stringify({ name, description, data_url: dataUrl }),
    });
  }
  deleteMarketplaceReference(id) {
    return this.request('/marketplace/references/' + id, { method: 'DELETE' });
  }
  translateMarketplacePage() {
    return this.request('/marketplace/page/translate', { method: 'POST' });
  }
  getMarketplaceTranslateStatus() {
    return this.request('/marketplace/page/translate/status');
  }
  // Blog translation: kicks off the same fire-and-forget translator
  // that the CLI script uses. Default scope is 'blog' (the only one
  // exposed via the admin button); the endpoint also accepts
  // tenants / partners / all for one-shot full re-runs.
  translateBlog(scope = 'blog') {
    const qs = scope ? '?scope=' + encodeURIComponent(scope) : '';
    return this.request('/blog/admin/translate-blog' + qs, { method: 'POST' });
  }
  getBlogTranslateStatus() {
    return this.request('/blog/admin/translate-blog/status');
  }
  getMarketplaceProgram(slug) {
    return this.request('/marketplace/programs/' + encodeURIComponent(slug));
  }
  getMarketplaceProgramSimilar(slug) {
    return this.request('/marketplace/programs/' + encodeURIComponent(slug) + '/similar');
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
  getPartnerNotificationPreferences() { return this.request('/partner/notification-preferences'); }
  updatePartnerNotificationPreferences(preferences) { return this.request('/partner/notification-preferences', { method: 'PUT', body: JSON.stringify({ preferences }) }); }
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
  getHubspotProperties(object) { return this.request('/crm/hubspot/properties/' + encodeURIComponent(object)); }
  getHubspotObjectMappings() { return this.request('/crm/hubspot/object-mappings'); }
  updateHubspotObjectMappings(data) { return this.request('/crm/hubspot/object-mappings', { method: 'PUT', body: JSON.stringify(data) }); }

  // Notion (multi-database: transactions / contacts / companies)
  getNotionStatus() { return this.request('/crm/notion/status'); }
  connectNotion(data) { return this.request('/crm/notion/connect', { method: 'POST', body: JSON.stringify(data) }); }
  disconnectNotion() { return this.request('/crm/notion/disconnect', { method: 'POST' }); }
  getNotionProperties(type) { return this.request('/crm/notion/properties/' + encodeURIComponent(type)); }
  getNotionMappings() { return this.request('/crm/notion/mappings'); }
  updateNotionMappings(mappings, statusMapping) {
    // statusMapping is optional — callers that only touch field
    // mappings can omit it. The backend applies each key it sees
    // and leaves the others untouched.
    const body = { mappings };
    if (statusMapping !== undefined) body.statusMapping = statusMapping;
    return this.request('/crm/notion/mappings', { method: 'PUT', body: JSON.stringify(body) });
  }
  syncReferralToNotion(referralId) { return this.request('/crm/notion/sync/' + referralId, { method: 'POST' }); }
  pullFromNotion() { return this.request('/crm/notion/pull', { method: 'POST' }); }
  pushToNotion() { return this.request('/crm/notion/push', { method: 'POST' }); }
  // One-shot bi-directional sync: backend does push+pull server-side
  // and returns both counts in a single response. Preferred over
  // two-round-trip pushToNotion()+pullFromNotion() from the UI.
  syncAllNotion() { return this.request('/crm/notion/sync-all', { method: 'POST' }); }
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

  // Audit logs (Settings → Historique tab; admin/superadmin only)
  getAuditLogs(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString();
    return this.request('/audit-logs' + (suffix ? '?' + suffix : ''));
  }

  // CSV export of the same filtered audit log set. Returns a Blob so
  // the caller can trigger a download via an <a download> link without
  // pulling JSON parsing into the path.
  async exportAuditLogsCsv(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString();
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}/audit-logs/export${suffix ? '?' + suffix : ''}`, { headers });
    if (!res.ok) throw new Error('Erreur export');
    return res.blob();
  }

  // Recent login events for the signed-in user (Settings → Profil →
  // Connexions récentes card). Returns { logins: [...] }.
  getLoginHistory() { return this.request('/auth/login-history'); }

  // Bumps users.token_version → all existing JWTs (this device + every
  // other) become invalid on next request. The frontend logs the user
  // out locally and routes to /login.
  invalidateSessions() {
    return this.request('/auth/invalidate-sessions', { method: 'POST' });
  }

  // Compliance dashboard (superadmin only) — single round-trip that
  // returns all 6 KPIs.
  getComplianceDashboard() { return this.request('/admin/compliance/dashboard'); }
}

export const api = new ApiClient();
export default api;
