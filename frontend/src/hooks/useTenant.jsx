import { useState, useEffect, createContext, useContext } from 'react';

const TenantContext = createContext(null);

const DEFAULT_TENANT = {
  name: 'Skipcall',
  slug: 'skipcall',
  primary_color: 'var(--rb-primary, #0e7a54)',
  secondary_color: '#0e7a54',
  accent_color: '#b4791f',
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
          root.style.setProperty('--primary', data.tenant.primary_color || '#0e7a54');
          root.style.setProperty('--secondary', data.tenant.secondary_color || '#0e7a54');
          root.style.setProperty('--accent', data.tenant.accent_color || '#b4791f');
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
