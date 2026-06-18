'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Target,
  Upload,
  Download,
  KanbanSquare,
  TableProperties,
  Search,
  Users,
  ArrowRight,
  Flame,
  Minus,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';

// On-demand chunks — the slide-over and import modal render only on interaction.
const LeadDetailPanel = dynamic(() => import('@/components/LeadDetailPanel'), { ssr: false });
const CSVImportModal = dynamic(() => import('@/components/CSVImportModal'), { ssr: false });

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title?: string;
  email: string;
  phone?: string;
  linkedIn?: string;
  stage: 'new' | 'sequence_active' | 'replied' | 'meeting_booked' | 'won' | 'lost';
  priority: 'hot' | 'warm' | 'cold';
  source?: string;
  lastContactedAt?: string;
  nextTaskDue?: string;
  nextTaskType?: string | null;
  tags?: string[];
  assignedTo?: { id: string; firstName: string; lastName: string };
  createdAt?: string;
}

const STAGE_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  new:             { label: 'New',            color: 'bg-zinc-800 border-zinc-700', dotColor: 'bg-zinc-400' },
  sequence_active: { label: 'In Sequence',    color: 'bg-blue-950 border-blue-800', dotColor: 'bg-blue-400' },
  replied:         { label: 'Replied',        color: 'bg-amber-950 border-amber-800', dotColor: 'bg-amber-400' },
  meeting_booked:  { label: 'Meeting Booked', color: 'bg-emerald-950 border-emerald-800', dotColor: 'bg-emerald-400' },
  won:             { label: 'Won',            color: 'bg-green-950 border-green-800', dotColor: 'bg-green-500' },
  lost:            { label: 'Lost',           color: 'bg-red-950 border-red-900', dotColor: 'bg-red-500' },
};

const PRIORITY_CONFIG = {
  hot:  { label: 'Hot',  class: 'bg-brand-red/10 text-brand-red border border-brand-red/20', icon: Flame },
  warm: { label: 'Warm', class: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', icon: Minus },
  cold: { label: 'Cold', class: 'bg-zinc-700/40 text-zinc-400 border border-zinc-700/40', icon: Minus },
};

const KANBAN_STAGES = ['new', 'replied', 'meeting_booked', 'won'] as const;

export default function LeadgenPage() {
  const { currentRole } = useAppContext();
  const { showToast } = useToast();
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Gate access
  useEffect(() => {
    if (currentRole !== 'leadgen') {
      router.replace('/');
    }
  }, [currentRole, router]);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch('/api/leads');
    if (res.ok) {
      const data = await res.json();
      setLeads(data);
    }
    setIsLoading(false);
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      setTeamMembers(data.filter((u: any) => u.role === 'leadgen'));
    }
  }, []);

  useEffect(() => {
    if (currentRole === 'leadgen') {
      fetchLeads();
      fetchTeamMembers();
    }
  }, [currentRole, fetchLeads, fetchTeamMembers]);

  // Stats
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const importedThisWeek = leads.filter(
    (l) => l.source === 'CSV Import' && l.createdAt && new Date(l.createdAt) >= weekAgo
  ).length;

  const readyToHandOff = leads.filter(
    (l) => l.stage === 'replied' || l.stage === 'meeting_booked'
  ).length;

  // Filtered leads
  const filtered = leads.filter((l) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.firstName.toLowerCase().includes(q) &&
        !l.lastName.toLowerCase().includes(q) &&
        !l.company.toLowerCase().includes(q) &&
        !l.email.toLowerCase().includes(q)
      )
        return false;
    }
    if (filterMember && l.assignedTo?.id !== filterMember) return false;
    if (filterPriority && l.priority !== filterPriority) return false;
    return true;
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const headers = ['First Name', 'Last Name', 'Company', 'Title', 'Email', 'Phone', 'Stage', 'Priority', 'Assigned To', 'Tags'];
      const rows = leads.map((l) => [
        l.firstName,
        l.lastName,
        l.company,
        l.title ?? '',
        l.email,
        l.phone ?? '',
        l.stage,
        l.priority,
        l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : '',
        (l.tags ?? []).join('; '),
      ]);
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leadgen-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported leads as CSV', 'success');
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (currentRole !== 'leadgen') return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-card-border bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-sm text-text-primary">Leadgen Pipeline</h1>
            <p className="text-[10px] text-text-muted font-mono">Import · Qualify · Hand off</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card-bg hover:bg-card-bg/80 border border-card-border text-text-secondary text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-6 py-3 border-b border-card-border bg-background flex-shrink-0">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Leads', value: leads.length, icon: Target, color: 'text-purple-400' },
            { label: 'Imported This Week', value: importedThisWeek, icon: Upload, color: 'text-blue-400' },
            { label: 'Ready to Hand Off', value: readyToHandOff, icon: ArrowRight, color: 'text-emerald-400' },
            { label: 'Team Members', value: teamMembers.length, icon: Users, color: 'text-amber-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card-bg border border-card-border rounded-xl px-4 py-3 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
              <div>
                <div className="text-xl font-bold text-text-primary font-display">{value}</div>
                <div className="text-[10px] text-text-muted font-mono uppercase">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-2.5 border-b border-card-border bg-background flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-card-bg border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-purple-500/50"
          />
        </div>

        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-purple-500/50"
        >
          <option value="">All Members</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-purple-500/50"
        >
          <option value="">All Priorities</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>

        <div className="ml-auto flex items-center gap-1 bg-card-bg border border-card-border rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'kanban'
                ? 'bg-purple-500/15 text-purple-300'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <KanbanSquare className="w-3.5 h-3.5" />
            Kanban
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-purple-500/15 text-purple-300'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <TableProperties className="w-3.5 h-3.5" />
            Table
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Target className="w-10 h-10 text-text-muted mb-3 opacity-40" />
            <p className="text-sm text-text-muted">No leads found.</p>
            <button
              onClick={() => setShowImport(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import from CSV
            </button>
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanView leads={filtered} onSelectLead={setSelectedLeadId} />
        ) : (
          <TableView leads={filtered} onSelectLead={setSelectedLeadId} />
        )}
      </div>

      {/* Lead detail slide-over */}
      {selectedLeadId && (
        <LeadDetailPanel
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onLeadUpdate={fetchLeads}
        />
      )}

      {/* CSV Import modal */}
      {showImport && (
        <CSVImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            fetchLeads();
            showToast('Leads imported successfully', 'success');
          }}
        />
      )}
    </div>
  );
}

// ─── Kanban View ─────────────────────────────────────────────────────────────

function KanbanView({ leads, onSelectLead }: { leads: Lead[]; onSelectLead: (id: string) => void }) {
  const byStage = (stage: string) => leads.filter((l) => l.stage === stage);

  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-2">
      {KANBAN_STAGES.map((stage) => {
        const cfg = STAGE_CONFIG[stage];
        const stageLeads = byStage(stage);
        return (
          <div key={stage} className="flex-shrink-0 w-64">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
                <span className="text-xs font-semibold text-text-secondary">{cfg.label}</span>
              </div>
              <span className="text-[10px] font-mono text-text-muted bg-card-bg border border-card-border rounded px-1.5 py-0.5">
                {stageLeads.length}
              </span>
            </div>
            <div className="space-y-2">
              {stageLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead.id)} />
              ))}
              {stageLeads.length === 0 && (
                <div className="border border-dashed border-card-border rounded-xl h-20 flex items-center justify-center">
                  <span className="text-[10px] text-text-muted">No leads</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const priCfg = PRIORITY_CONFIG[lead.priority];
  const PriIcon = priCfg.icon;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card-bg border border-card-border rounded-xl p-3 hover:border-purple-500/30 hover:bg-card-bg/80 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary truncate">
            {lead.firstName} {lead.lastName}
          </p>
          <p className="text-[10px] text-text-muted truncate">{lead.company}</p>
        </div>
        <span className={`flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${priCfg.class}`}>
          <PriIcon className="w-2.5 h-2.5" />
          {priCfg.label}
        </span>
      </div>
      {lead.assignedTo && (
        <p className="text-[10px] text-text-muted truncate">
          → {lead.assignedTo.firstName} {lead.assignedTo.lastName}
        </p>
      )}
    </button>
  );
}

// ─── Table View ──────────────────────────────────────────────────────────────

function TableView({ leads, onSelectLead }: { leads: Lead[]; onSelectLead: (id: string) => void }) {
  return (
    <div className="bg-card-bg border border-card-border rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-card-border text-text-muted font-mono uppercase text-[10px]">
            <th className="text-left px-4 py-2.5 font-medium">Name</th>
            <th className="text-left px-4 py-2.5 font-medium">Company</th>
            <th className="text-left px-4 py-2.5 font-medium">Stage</th>
            <th className="text-left px-4 py-2.5 font-medium">Priority</th>
            <th className="text-left px-4 py-2.5 font-medium">Assigned</th>
            <th className="text-left px-4 py-2.5 font-medium">Email</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, idx) => {
            const stageCfg = STAGE_CONFIG[lead.stage] ?? STAGE_CONFIG.new;
            const priCfg = PRIORITY_CONFIG[lead.priority];
            return (
              <tr
                key={lead.id}
                onClick={() => onSelectLead(lead.id)}
                className={`border-b border-card-border/50 hover:bg-purple-500/5 cursor-pointer transition-colors ${
                  idx % 2 === 0 ? '' : 'bg-background/30'
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-text-primary">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{lead.company}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-medium ${stageCfg.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${stageCfg.dotColor}`} />
                    {stageCfg.label}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${priCfg.class}`}>
                    {priCfg.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-text-muted">
                  {lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-text-muted font-mono">{lead.email}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
