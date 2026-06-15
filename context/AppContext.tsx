'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export type UserRole = 'director' | 'floor_manager' | 'team_lead' | 'sdr' | 'leadgen';

interface AppContextType {
  currentRole: UserRole;
  setRole: (role: UserRole) => void;
  currentUserId: string;
  currentUser: { firstName: string; lastName: string; email: string } | null;
  isManager: boolean;
  activeNewModal: 'lead' | 'task' | 'reminder' | 'campaign' | null;
  setActiveNewModal: (type: 'lead' | 'task' | 'reminder' | 'campaign' | null) => void;
  isSessionLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  // The real role comes from the session; the demo switcher can override it
  // for managers who want to see the SDR perspective.
  const sessionRole = (session?.user as any)?.role as UserRole | undefined;
  const [overrideRole, setOverrideRole] = useState<UserRole | null>(null);

  const [activeNewModal, setActiveNewModal] = useState<'lead' | 'task' | 'reminder' | 'campaign' | null>(null);

  // When the session role changes, clear any override
  useEffect(() => {
    setOverrideRole(null);
  }, [sessionRole]);

  // In dev/demo mode, default to the director persona so the app is usable without login
  const isDemoMode = process.env.NODE_ENV !== 'production';
  const currentRole: UserRole = overrideRole ?? sessionRole ?? (isDemoMode ? 'director' : 'sdr');
  const currentUserId: string = (session?.user as any)?.id ?? (isDemoMode ? 'u1' : '');
  const isManager: boolean = currentRole !== 'sdr' && currentRole !== 'leadgen';
  const currentUser = session?.user
    ? {
        firstName: (session.user as any).firstName ?? '',
        lastName: (session.user as any).lastName ?? '',
        email: session.user.email ?? '',
      }
    : isDemoMode
    ? { firstName: 'Son', lastName: 'Nguyen', email: 'son@telestar.co' }
    : null;

  const setRole = (role: UserRole) => {
    // Allow demo persona switching for directors; others always see their real role
    if (sessionRole === 'director' || sessionRole === 'floor_manager' || !sessionRole) {
      setOverrideRole(role);
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentRole,
        setRole,
        currentUserId,
        currentUser,
        isManager,
        activeNewModal,
        setActiveNewModal,
        isSessionLoading: status === 'loading',
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
}
