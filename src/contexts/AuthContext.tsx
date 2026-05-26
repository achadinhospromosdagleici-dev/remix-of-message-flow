import React, { createContext, useContext, useEffect, useState } from 'react';

const API_BASE = '/api/auth';

interface AuthUser {
  id: string;
  email: string;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  trial_started_at: string;
  trial_ends_at: string;
  notes: string | null;
  created_at: string;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  isSuperadmin: boolean;
  trialActive: boolean;
  trialDaysLeft: number;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function storeSession(token: string, userId: string, email: string) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user_id', userId);
  localStorage.setItem('auth_user_email', email);
}

function clearSession() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user_id');
  localStorage.removeItem('auth_user_email');
}

function getStoredToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function fetchMe(token: string): Promise<{ user: AuthUser; profile: UserProfile; roles: string[] }> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Token inválido');
  return res.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    fetchMe(token)
      .then(data => {
        setUser(data.user);
        setProfile(data.profile);
        setIsSuperadmin(data.roles.includes('superadmin'));
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: new Error(data.error) };
      storeSession(data.token, data.user.id, data.user.email);
      setUser(data.user);
      setProfile(data.profile);
      setIsSuperadmin(data.roles.includes('superadmin'));
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });
      const data = await res.json();
      if (!res.ok) return { error: new Error(data.error) };
      storeSession(data.token, data.user.id, data.user.email);
      setUser(data.user);
      setProfile(data.profile);
      setIsSuperadmin(data.roles.includes('superadmin'));
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signOut = async () => {
    clearSession();
    setUser(null);
    setProfile(null);
    setIsSuperadmin(false);
  };

  const refreshProfile = async () => {
    const token = getStoredToken();
    if (!token || !user) return;
    try {
      const data = await fetchMe(token);
      setProfile(data.profile);
      setIsSuperadmin(data.roles.includes('superadmin'));
    } catch {
      // ignore
    }
  };

  const trialEndsMs = profile ? new Date(profile.trial_ends_at).getTime() : 0;
  const trialDaysLeft = profile ? Math.max(0, Math.ceil((trialEndsMs - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const trialActive = isSuperadmin || (!!profile && profile.is_active && trialEndsMs > Date.now());

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isSuperadmin,
        trialActive,
        trialDaysLeft,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
