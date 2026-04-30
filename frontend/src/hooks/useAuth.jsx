import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

// Wipe any cached tenant blob from localStorage so the sidebar can't
// briefly flash the previous tenant's name when the user switches
// workspaces. Keep skipcall_token + skipcall_user since useAuth
// rewrites them in the same tick.
function clearTenantCache() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('skipcall_tenant') || key === 'rb_tenant' || key === 'rb_tenant_name') {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.getUser());
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState([]);
  // When /auth/login or /auth/google returns requiresSpaceSelection
  // we stash the spaces list here so the LoginPage can render the
  // picker modal. The temp token is already sitting in api.token by
  // then, scoped to /auth/me/spaces + /auth/switch-space only.
  const [pendingSpaceSelection, setPendingSpaceSelection] = useState(null);

  const refreshSpaces = useCallback(async () => {
    try {
      const data = await api.getMySpaces();
      setSpaces(data.spaces || []);
    } catch {
      setSpaces([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Don't hit /auth/me at all when there's no token — it would 401,
      // and the 401 handler in api.js would bounce guests off public
      // marketing pages (/fonctionnalites/*, /blog, etc.) to /login.
      if (!api.token) {
        setUser(null);
        setSpaces([]);
        setLoading(false);
        return;
      }
      try {
        const data = await api.getMe();
        setUser(data.user);
        api.setUser(data.user);
        await refreshSpaces();
      } catch {
        setUser(null);
        setSpaces([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshSpaces]);

  const login = async (email, password) => {
    clearTenantCache();
    const data = await api.login(email, password);
    if (data.requiresSpaceSelection) {
      // Don't materialize the user yet — the temp token can't load
      // any tenant-scoped data, and we don't want the sidebar to
      // flash a partial profile. The picker modal owns the next step.
      setPendingSpaceSelection({ spaces: data.spaces || [], user: data.user });
      setSpaces(data.spaces || []);
      setUser(null);
      return data;
    }
    setUser(data.user);
    setPendingSpaceSelection(null);
    await refreshSpaces();
    return data;
  };

  const loginWithGoogle = async (credential) => {
    clearTenantCache();
    const data = await api.loginWithGoogle(credential);
    if (data.needsSignup) return data;
    if (data.requiresSpaceSelection) {
      setPendingSpaceSelection({ spaces: data.spaces || [], user: data.user });
      setSpaces(data.spaces || []);
      setUser(null);
      return data;
    }
    setUser(data.user);
    setPendingSpaceSelection(null);
    await refreshSpaces();
    return data;
  };

  const logout = async () => {
    clearTenantCache();
    await api.logout();
    setUser(null);
    setSpaces([]);
    setPendingSpaceSelection(null);
  };

  const switchSpace = async (space) => {
    clearTenantCache();
    const data = await api.switchSpace({
      tenantId: space.tenant_id,
      role: space.role,
      partnerId: space.partner_id || null,
    });
    if (data.token) api.setToken(data.token);
    if (data.user) api.setUser(data.user);
    setUser(data.user);
    setPendingSpaceSelection(null);
    await refreshSpaces();
    return data;
  };

  const currentSpace = user
    ? spaces.find(
        (s) =>
          s.tenant_id === user.tenant_id &&
          s.role === user.role &&
          (s.partner_id || null) === (user.partner_id || null)
      ) || null
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        spaces,
        currentSpace,
        pendingSpaceSelection,
        login,
        loginWithGoogle,
        logout,
        switchSpace,
        refreshSpaces,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
