'use client';

import React from 'react';
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

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-bg-main text-text-main transition-colors duration-200">
      <Sidebar userRole={currentRole} />

      <div className="flex-1 flex flex-col min-w-0 pl-14 xl:pl-52">
        <Topbar
          currentRole={currentRole}
          onRoleChange={setRole}
          onNewAction={(type) => setActiveNewModal(type as any)}
        />

        <main className="flex-1 pt-16 p-6 min-h-[calc(100vh-4rem)] flex flex-col aurora-bg">
          {children}
        </main>
      </div>

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
