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
      value={{ user, loading, spaces, currentSpace, login, logout, switchSpace, refreshSpaces }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
