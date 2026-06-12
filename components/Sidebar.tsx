'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Repeat,
  FileText,
  BarChart3,
  Settings,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';

interface SidebarProps {
  userRole?: 'director' | 'floor_manager' | 'team_lead' | 'sdr' | 'leadgen';
}

export default function Sidebar({ userRole = 'sdr' }: SidebarProps) {
  const pathname = usePathname();
  const { currentUser, isManager } = useAppContext();

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Leads', href: '/leads', icon: Users },
    { name: 'Sequences', href: '/sequences', icon: Repeat },
    { name: 'Performance', href: '/sequences/performance', icon: TrendingUp },
    { name: 'Templates', href: '/templates', icon: FileText },
    // Leadgen gets their own view instead of Team View
    ...(userRole === 'leadgen' ? [{ name: 'Leadgen', href: '/leadgen', icon: Target }] : []),
    // Team View visible for any manager (including Dominic, who has isManager=true)
    ...(isManager ? [{ name: 'Team View', href: '/team', icon: BarChart3 }] : []),
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex flex-col glass-sidebar border-r border-sidebar-border text-sidebar-text w-14 xl:w-52">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-3 py-5 border-b border-sidebar-border h-16">
        <div className="flex items-center justify-center bg-brand-red/10 rounded-lg p-1.5 text-brand-red logo-glow">
          {/* Fiery Star Custom SVG/Icon */}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="currentColor" 
            className="w-6 h-6 text-brand-red drop-shadow-[0_0_8px_rgba(212,43,30,0.6)]"
          >
            <path d="M12 2L14.73 8.35L21.6 9L16.42 13.56L17.95 20.3L12 16.72L6.05 20.3L7.58 13.56L2.4 9L9.27 8.35L12 2Z" />
            <path 
              d="M12 17.5C12 17.5 14.5 13 14.5 11C14.5 9 12 6.5 12 6.5C12 6.5 9.5 9 9.5 11C9.5 13 12 17.5 12 17.5Z" 
              fill="url(#flameGrad)" 
              opacity="0.9"
            />
            <defs>
              <linearGradient id="flameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E8611A" />
                <stop offset="100%" stopColor="#FEDD44" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <span className="hidden xl:inline-block font-display font-extrabold text-base tracking-wide bg-gradient-to-r from-brand-red via-brand-orange to-brand-gold bg-clip-text text-transparent">
          TELESTAR
        </span>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative focus-ring ${
                isActive
                  ? 'bg-brand-red/15 text-white font-semibold shadow-md shadow-brand-red/10 border-beam-container'
                  : 'text-sidebar-text-muted hover:bg-sidebar-border hover:text-sidebar-text'
              }`}
            >
              {isActive && <span className="sidebar-beam-indicator" aria-hidden="true" />}
              <Icon aria-hidden="true" className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                isActive ? 'text-white drop-shadow-[0_0_6px_rgba(212,43,30,0.4)]' : 'text-sidebar-text-muted group-hover:text-sidebar-text'
              }`} />

              <span className="hidden xl:inline-block truncate">
                {item.name}
              </span>

              {/* Tooltip for collapsed state */}
              <div role="tooltip" className="absolute left-14 hidden group-hover:flex xl:group-hover:hidden bg-brand-dark text-white text-xs py-1 px-2.5 rounded border border-sidebar-border whitespace-nowrap shadow-md z-30 pointer-events-none">
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Scoping Info (Footer of Sidebar) */}
      <div
        className="p-3 border-t border-sidebar-border flex items-center justify-between gap-3 bg-sidebar-bg/50"
        aria-label={currentUser ? `Logged in as ${currentUser.firstName} ${currentUser.lastName}, role: ${userRole}` : `Current role: ${userRole}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-sidebar-border border border-sidebar-border flex items-center justify-center font-bold text-xs text-brand-orange uppercase flex-shrink-0">
            {currentUser
              ? `${currentUser.firstName[0]}${currentUser.lastName[0]}`
              : userRole === 'director' ? 'SN' : '??'}
          </div>
          <div className="hidden xl:flex flex-col min-w-0">
            <span className="text-xs font-semibold text-sidebar-text truncate">
              {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Loading...'}
            </span>
            <span className="text-[10px] text-sidebar-text-muted font-mono tracking-tighter truncate uppercase">
              {userRole.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
