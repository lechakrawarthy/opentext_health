import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { setLiveMode } from './live.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, perms: new Set(), loading: true });

  const refresh = useCallback(async () => {
    try {
      const me = await api('/auth/me');
      setLiveMode(me.runtime);
      setState({ user: me.user, perms: new Set(me.permissions), loading: false });
      return me;
    } catch {
      setState({ user: null, perms: new Set(), loading: false });
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email, password) => {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      return refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ user: null, perms: new Set(), loading: false });
  }, []);

  const value = useMemo(
    () => ({ ...state, can: (p) => state.perms.has(p), refresh, login, logout }),
    [state, refresh, login, logout],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
