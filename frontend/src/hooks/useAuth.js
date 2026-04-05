import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(api.getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = api.getUser();
    if (savedUser && api.token) {
      // Verify token is still valid
      api.getMe()
        .then(data => {
          const u = {
            id: data.user.id,
            email: data.user.email,
            fullName: data.user.full_name,
            role: data.user.role,
            partnerId: data.user.partner_id,
            partnerName: data.user.partner_name,
          };
          setUser(u);
          api.setUser(u);
        })
        .catch(() => {
          setUser(null);
          api.setToken(null);
          api.setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
