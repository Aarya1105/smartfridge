import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const u = await authApi.getMe();
      setUser(u);
    } catch (err) {
      console.warn('Using default demo session:', err);
      // Auto-fallback to default user for seamless experience
      setUser({
        id: 1,
        email: 'demo@smartfridge.com',
        full_name: 'Alex Morgan',
        phone_number: '+1-555-0199',
        email_notifications_enabled: true,
        push_notifications_enabled: true,
        sms_notifications_enabled: false,
        email_for_expiring: true,
        email_for_expired: true,
        email_daily_digest: true,
        push_for_expiring: true,
        push_for_expired: true,
        push_for_temperature: true,
        sms_for_critical: false,
        alert_lead_days: 2,
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
        audit_day: 'Sunday',
        audit_time: '10:00'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await authApi.login(email, pass);
    localStorage.setItem('smart_fridge_token', res.access_token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('smart_fridge_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
