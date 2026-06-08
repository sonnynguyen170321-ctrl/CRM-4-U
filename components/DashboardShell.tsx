'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import NewLeadModal from './NewLeadModal';
import NewTaskModal from './NewTaskModal';
import NewReminderModal from './NewReminderModal';
import NewCampaignModal from './NewCampaignModal';
import { useAppContext } from '@/context/AppContext';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { currentRole, setRole, setActiveNewModal, activeNewModal } = useAppContext();
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // All hooks must be called before any conditional return
  useEffect(() => {
    const saved = localStorage.getItem('telestar-sidebar-collapsed');
    if (saved === 'true') {
      setIsSidebarCollapsed(true);
    }
  }, []);

  // Auth pages render without the dashboard shell
  if (pathname === '/login') {
    return <>{children}</>;
  }

  const handleToggleSidebar = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
    localStorage.setItem('telestar-sidebar-collapsed', collapsed ? 'true' : 'false');
  };

  return (
    <div className="min-h-screen flex bg-bg-main text-text-main transition-colors duration-200">
      {/* Persistent Sidebar */}
      <Sidebar 
        userRole={currentRole} 
        isCollapsed={isSidebarCollapsed}
        onToggle={() => handleToggleSidebar(!isSidebarCollapsed)}
      />

      {/* Floating button to make sidebar appear when collapsed */}
      {isSidebarCollapsed && (
        <button
          onClick={() => handleToggleSidebar(false)}
          className="fixed left-3.5 top-3.5 w-9 h-9 bg-card-bg border border-card-border rounded-xl flex items-center justify-center text-text-primary hover:bg-card-border hover:text-brand-red transition-all shadow-md z-30 cursor-pointer animate-in fade-in slide-in-from-left duration-200"
          title="Show Sidebar"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Content Area (Offset by sidebar width, or 0 if collapsed) */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
        isSidebarCollapsed ? 'pl-0' : 'pl-16 xl:pl-60'
      }`}>
        
        {/* Persistent Topbar */}
        <Topbar
          currentRole={currentRole}
          onRoleChange={setRole}
          onNewAction={(type) => setActiveNewModal(type as any)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Main Workspace Frame */}
        <main className="flex-1 pt-16 p-6 min-h-[calc(100vh-4rem)] flex flex-col aurora-bg">
          {children}
        </main>
      </div>

      {/* Global modals */}
      {activeNewModal === 'lead' && (
        <NewLeadModal
          onClose={() => setActiveNewModal(null)}
          onSuccess={() => {
            setActiveNewModal(null);
            window.dispatchEvent(new CustomEvent('crm:lead-created'));
          }}
        />
      )}
      {activeNewModal === 'task' && (
        <NewTaskModal
          onClose={() => setActiveNewModal(null)}
          onSuccess={() => {
            setActiveNewModal(null);
            window.dispatchEvent(new CustomEvent('crm:task-created'));
          }}
        />
      )}
      {activeNewModal === 'reminder' && (
        <NewReminderModal onClose={() => setActiveNewModal(null)} />
      )}
      {activeNewModal === 'campaign' && (
        <NewCampaignModal onClose={() => setActiveNewModal(null)} />
      )}
    </div>
  );
}
