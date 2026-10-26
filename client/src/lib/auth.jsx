import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | offline
  const [slow, setSlow] = useState(false);

  const check = useCallback(async () => {
    setStatus('loading');
    // Free hosting sleeps when idle; tell the user if the first request is slow.
    const t = setTimeout(() => setSlow(true), 4000);
    try {
      const { user: u } = await api('/auth/me');
      setUser(u);
      setStatus('ready');
    } catch (err) {
      setUser(null);
      setStatus(err.status === 401 ? 'ready' : 'offline');
    } finally {
      clearTimeout(t);
      setSlow(false);
    }
  }, []);

  useEffect(() => {
    check();
    setUnauthorizedHandler(() => setUser(null)); // session expired mid-use -> back to login
  }, [check]);

  const value = useMemo(
    () => ({
      user,
      status,
      slow,
      retry: check,
      login: async (email, password) => {
        const { user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
        setUser(u);
      },
      register: async (name, email, password) => {
        const { user: u } = await api('/auth/register', { method: 'POST', body: { name, email, password } });
        setUser(u);
      },
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        setUser(null);
      },
    }),
    [user, status, slow, check],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
