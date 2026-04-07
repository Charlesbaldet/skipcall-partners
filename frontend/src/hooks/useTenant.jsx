import { useState, useEffect, createContext, useContext } from 'react';

const TenantContext = createContext(null);

const DEFAULT_TENANT = {
  name: 'Skipcall',
  slug: 'skipcall',
  primary_color: 'var(--rb-primary, #047857)',
  secondary_color: '#8b5cf6',
  accent_color: '#f59e0b',
  logo_url: null,
};

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(DEFAULT_TENANT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_URL || '/api';
    fetch(`${API_BASE}/tenants/config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tenant) {
          setTenant({ ...DEFAULT_TENANT, ...data.tenant });
          // Inject CSS variables for theming
          const root = document.documentElement;
          root.style.setProperty('--primary', data.tenant.primary_color || '#6366f1');
          root.style.setProperty('--secondary', data.tenant.secondary_color || '#8b5cf6');
          root.style.setProperty('--accent', data.tenant.accent_color || '#f59e0b');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext) || { tenant: DEFAULT_TENANT, loading: false };
}
