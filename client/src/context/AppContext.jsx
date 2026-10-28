import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/auth/me').catch(() => ({ user: null })), api.get('/public/config').catch(() => ({}))]).then(([me, cfg]) => {
      setUser(me.user);
      setConfig(cfg);
      setReady(true);
    });
  }, []);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3900 ? null : t)), 4000);
  }, []);

  const login = useCallback(async (email, password) => {
    const { user } = await api.post('/auth/login', { email, password });
    setUser(user);
    return user;
  }, []);

  const signup = useCallback(async (data) => {
    const { user } = await api.post('/auth/signup', data);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, config, tz: config?.timezone, ready, login, signup, logout, notify, toast, setToast }),
    [user, config, ready, login, signup, logout, notify, toast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);

export const homeFor = (user) => (!user ? '/' : user.role === 'ADMIN' ? '/admin' : user.role === 'PRO' ? '/pro' : '/app');
