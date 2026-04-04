const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('skipcall_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('skipcall_token', token);
    } else {
      localStorage.removeItem('skipcall_token');
    }
  }

  getUser() {
    const data = localStorage.getItem('skipcall_user');
    return data ? JSON.parse(data) : null;
  }

  setUser(user) {
    if (user) {
      localStorage.setItem('skipcall_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('skipcall_user');
    }
  }

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      this.setToken(null);
      this.setUser(null);
      window.location.href = '/login';
      throw new Error('Session expirÃ©e');
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erreur serveur');
    }
    return data;
  }

  // âââ Auth âââ
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  logout() {
    this.setToken(null);
    this.setUser(null);
  }

  getMe() { return this.request('/auth/me'); }
  changePassword(currentPassword, newPassword) {
    return this.request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
  }

  // âââ Partners âââ
  getPartners() { return this.request('/partners'); }
  getPartner(id) { return this.request(`/partners/${id}`); }
  createPartner(data) { return this.request('/partners', { method: 'POST', body: JSON.stringify(data) }); }
  updatePartner(id, data) { return this.request(`/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }

  // âââ Referrals âââ
  getReferrals(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/referrals?${qs}`);
  }
  getReferral(id) { return this.request(`/referrals/${id}`); }
  createReferral(data) { return this.request('/referrals', { method: 'POST', body: JSON.stringify(data) }); }
  updateReferral(id, data) { return this.request(`/referrals/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }

  // âââ Commissions âââ
  getCommissions(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/commissions?${qs}`);
  }
  getCommissionsSummary() { return this.request('/commissions/summary'); }
  updateCommission(id, status) { return this.request(`/commissions/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }); }

  // âââ Dashboard âââ
  getKPIs() { return this.request('/dashboard/kpis'); }
  getTimeline(months = 6) { return this.request(`/dashboard/timeline?months=${months}`); }
  getPipeline() { return this.request('/dashboard/pipeline'); }
  getTopPartners() { return this.request('/dashboard/top-partners'); }
  getLevels() { return this.request('/dashboard/levels'); }
}

export const api = new ApiClient();
export default api;
