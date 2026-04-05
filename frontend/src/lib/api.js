const API_BASE = '/api';
class ApiClient {
  constructor() {
    this.token = localStorage.getItem('skipcall_token');
    try { this.user = JSON.parse(localStorage.getItem('skipcall_user') || 'null'); } catch(e) { this.user = null; }
  }
  setToken(t) { this.token = t; if(t) localStorage.setItem('skipcall_token',t); else localStorage.removeItem('skipcall_token'); }
  getUser() { return this.user; }
  setUser(u) { this.user = u; if(u) localStorage.setItem('skipcall_user',JSON.stringify(u)); else localStorage.removeItem('skipcall_user'); }
  logout() { this.token=null; this.user=null; localStorage.removeItem('skipcall_token'); localStorage.removeItem('skipcall_user'); }
  async request(p, o={}) {
    const h = {'Content-Type':'application/json',...o.headers};
    if(this.token) h['Authorization']='Bearer '+this.token;
    try {
      const r = await fetch(API_BASE+p,{...o,headers:h});
      if(r.status===401){this.logout();window.location.href='/login';return;}
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { if(!r.ok) throw new Error('Erreur serveur ('+r.status+')'); return {}; }
      if(!r.ok) throw new Error(data.error||'Erreur serveur');
      return data;
    } catch(e) { if(e.message.includes('Failed to fetch')) throw new Error('Connexion impossible'); throw e; }
  }
  get(p){return this.request(p)}
  post(p,b){return this.request(p,{method:'POST',body:JSON.stringify(b)})}
  put(p,b){return this.request(p,{method:'PUT',body:JSON.stringify(b)})}
  del(p){return this.request(p,{method:'DELETE'})}
  async login(e,pw){const d=await this.post('/auth/login',{email:e,password:pw});this.setToken(d.token);this.setUser(d.user);return d}
  getMe(){return this.get('/auth/me')}
  changePassword(c,n){return this.put('/auth/password',{currentPassword:c,newPassword:n})}
  // Dashboard
  getDashboard(){return this.get('/dashboard')}
  getKPIs(){return this.get('/dashboard/kpis')}
  getLevels(){return this.get('/dashboard/levels')}
  getTopPartners(){return this.get('/dashboard/top-partners')}
  getTimeline(){return this.get('/dashboard/timeline')}
  getPartnerDashboard(){return this.get('/dashboard/partner')}
  // Partners
  getPartners(){return this.get('/partners')}
  getPartner(id){return this.get('/partners/'+id)}
  createPartner(d){return this.post('/partners',d)}
  updatePartner(id,d){return this.put('/partners/'+id,d)}
  deletePartner(id){return this.del('/partners/'+id)}
  archivePartner(id){return this.put('/partners/'+id+'/archive')}
  reactivatePartner(id){return this.put('/partners/'+id+'/reactivate')}
  updatePartnerIban(id,d){return this.put('/partners/'+id+'/iban',d)}
  getMyProfile(){return this.get('/partners/me/profile')}
  getMyPartnerProfile(){return this.get('/partners/me/profile')}
  updateMyIban(d){return this.put('/partners/me/iban',d)}
  // Referrals
  getReferrals(p){const q=p?'?'+new URLSearchParams(p):'';return this.get('/referrals'+q)}
  getPipeline(p){const q=p?'?'+new URLSearchParams(p):'';return this.get('/referrals'+q)}
  getReferral(id){return this.get('/referrals/'+id)}
  createReferral(d){return this.post('/referrals',d)}
  updateReferral(id,d){return this.put('/referrals/'+id,d)}
  deleteReferral(id){return this.del('/referrals/'+id)}
  // Commissions
  getCommissions(p){const q=p?'?'+new URLSearchParams(p):'';return this.get('/commissions'+q)}
  getCommissionsSummary(){return this.get('/commissions/summary')}
  updateCommission(id,d){return this.put('/commissions/'+id,d)}
  // Messages
  getConversations(){return this.get('/messages/conversations')}
  getConversation(id){return this.get('/messages/conversations/'+id)}
  getMessages(id){return this.get('/messages/conversations/'+id)}
  getMessageableUsers(){return this.get('/messages/users')}
  createConversation(d){return this.post('/messages/conversations',d)}
  sendMessage(cid,c){return this.post('/messages/conversations/'+cid+'/messages',{content:c})}
  markAsRead(cid){return this.put('/messages/conversations/'+cid+'/read')}
  getUnreadCount(){return this.get('/messages/unread-count')}
  // Applications (v3)
  getApplications(s){return this.get('/applications?status='+(s||'pending'))}
  approveApplication(id,r){return this.put('/applications/'+id+'/approve',{commission_rate:r})}
  rejectApplication(id,r){return this.put('/applications/'+id+'/reject',{reason:r})}
  // Admin (v3)
  getAdminUsers(){return this.get('/admin/users')}
  inviteUser(d){return this.post('/admin/invite',d)}
  getInvitations(){return this.get('/admin/invitations')}
  updateAdminUser(id,d){return this.put('/admin/users/'+id,d)}
  deleteInvitation(id){return this.del('/admin/invitations/'+id)}
}
const api = new ApiClient();
export default api;
