import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, getCachedUser, getToken, saveSession } from './api';
import { navigate } from './router';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCachedUser());
  const [token, setToken] = useState(() => getToken());
  const [booting, setBooting] = useState(() => Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    let active = true;
    api('/api/users/me')
      .then((data) => {
        if (!active) return;
        setUser(data.user);
        saveSession(null, data.user);
      })
      .catch(() => {
        if (!active) return;
        clearSession();
        setUser(null);
        setToken('');
      })
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      async login(username, password) {
        const data = await api('/api/auth/login', {
          method: 'POST',
          auth: false,
          body: { username, password },
        });
        saveSession(data.token, data.user);
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      logout() {
        clearSession();
        setToken('');
        setUser(null);
        navigate('/login', { replace: true });
      },
      updateUser(nextUser) {
        setUser(nextUser);
        saveSession(null, nextUser);
      },
      refreshUser() {
        return api('/api/users/me').then((data) => {
          setUser(data.user);
          saveSession(null, data.user);
          return data.user;
        });
      },
    }),
    [user, token, booting]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return context;
}
