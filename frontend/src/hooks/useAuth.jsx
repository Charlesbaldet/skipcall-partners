import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.getUser());
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState([]);

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
    const data = await api.login(email, password);
    setUser(data.user);
    await refreshSpaces();
    return data;
  };

  // Google SSO — same post-login steps as `login`, plus a caller
  // signal (`needsSignup`) when the email isn't registered yet so
  // pages can route the visitor to /signup with the email pre-filled.
  const loginWithGoogle = async (credential) => {
    const data = await api.loginWithGoogle(credential);
    if (data.needsSignup) return data;
    setUser(data.user);
    await refreshSpaces();
    return data;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setSpaces([]);
  };

  const switchSpace = async (space) => {
    const data = await api.switchSpace({
      tenantId: space.tenant_id,
      role: space.role,
      partnerId: space.partner_id || null,
    });
    // Persist new JWT and user so subsequent requests use the new role
    if (data.token) api.setToken(data.token);
    if (data.user) api.setUser(data.user);
    setUser(data.user);
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
      value={{ user, loading, spaces, currentSpace, login, loginWithGoogle, logout, switchSpace, refreshSpaces }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
