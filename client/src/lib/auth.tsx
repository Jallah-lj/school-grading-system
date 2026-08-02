import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, tokenStore } from './api';

import type { Role, SessionUser } from './types';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tokenStore.access) {
        try {
          const { data } = await api.get<{ user: SessionUser }>('/auth/me');
          if (!cancelled) setUser(data.user);
        } catch {
          tokenStore.clear();
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    const onSession = (e: Event) => setUser((e as CustomEvent<SessionUser>).detail);
    window.addEventListener('sgs:logout', onLogout);
    window.addEventListener('sgs:session', onSession);
    return () => {
      window.removeEventListener('sgs:logout', onLogout);
      window.removeEventListener('sgs:session', onSession);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user as SessionUser;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('sgs.refreshToken');
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);

  const value = useMemo(
    () => ({ user, loading, login, logout, hasRole }),
    [user, loading, login, logout, hasRole],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
