'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Check,
  Clock,
  Calendar,
  MessageSquare,
  PhoneCall,
  Mail,
  ChevronsRight,
  BarChart,
  Users,
  Award,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import LeadDetailPanel from '@/components/LeadDetailPanel';

interface TaskLead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  priority: string;
  stage: string;
  tags?: string[];
}

interface Task {
  id: string;
  leadId: string;
  lead: TaskLead;
  type: 'email' | 'phone' | 'linkedin' | 'whatsapp' | 'manual';
  title: string;
  description: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'skipped';
  completedAt: string | null;
  priority: string;
}

export default function DashboardPage() {
  const { currentRole } = useAppContext();
  const { showToast } = useToast();

  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [yesterdayTasks, setYesterdayTasks] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedSdrId, setSelectedSdrId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'today' | 'yesterday' | 'overdue'>('today');
  const [loggingTask, setLoggingTask] = useState<Task | null>(null);
  const [callOutcome, setCallOutcome] = useState('no_answer');
  const [channelAction, setChannelAction] = useState('');
  const [responseReceived, setResponseReceived] = useState(false);
  const [responseStage, setResponseStage] = useState('');
  const [activityNote, setActivityNote] = useState('');
  const [loggingModalOpen, setLoggingModalOpen] = useState(false);
  const [rescheduleTask, setRescheduleTask] = useState<Task | null>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [meetingPrompt, setMeetingPrompt] = useState<Task | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [quickNoteTask, setQuickNoteTask] = useState<Task | null>(null);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [sdrPipelineCounts, setSdrPipelineCounts] = useState<Record<string, number>>({});

  const fetchTasks = useCallback(async (tab: string, userId?: string) => {
    const params = new URLSearchParams({ tab });
    if (userId && userId !== 'all') params.set('userId', userId);
    const res = await fetch(`/api/tasks?${params}`);
    if (!res.ok) return [];
    return res.json();
  }, []);

  const loadAll = useCallback(async () => {
    const uid = currentRole !== 'sdr' ? selectedSdrId : undefined;
    const actParams = uid && uid !== 'all' ? `?limit=20&userId=${uid}` : '?limit=20';
    const fetches: Promise<any>[] = [
      fetchTasks('today', uid),
      fetchTasks('yesterday', uid),
      fetchTasks('overdue', uid),
      fetch(`/api/activities${actParams}`).then((r) => (r.ok ? r.json() : [])),
    ];
    if (currentRole === 'sdr') {
      fetches.push(fetch('/api/leads').then((r) => (r.ok ? r.json() : [])));
    }
    const results = await Promise.all(fetches);
    const [today, yesterday, overdue, acts] = results;
    setTodayTasks(Array.isArray(today) ? today : []);
    setYesterdayTasks(Array.isArray(yesterday) ? yesterday : []);
    setOverdueTasks(Array.isArray(overdue) ? overdue : []);
    setActivities(Array.isArray(acts) ? acts : []);
    if (currentRole === 'sdr' && results[4]) {
      const leadList: any[] = Array.isArray(results[4]) ? results[4] : [];
      const counts: Record<string, number> = {};
      leadList.forEach((l) => { counts[l.stage] = (counts[l.stage] ?? 0) + 1; });
      setSdrPipelineCounts(counts);
    }
  }, [currentRole, selectedSdrId, fetchTasks]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const handler = () => loadAll();
    window.addEventListener('crm:task-created', handler);
    return () => window.removeEventListener('crm:task-created', handler);
  }, [loadAll]);

  useEffect(() => {
    if (currentRole !== 'sdr') {
      fetch('/api/users')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setUsers(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [currentRole]);

  const completedTodayCount = todayTasks.filter((t) => t.status === 'completed').length;
  const pendingTodayCount = todayTasks.filter((t) => t.status === 'pending').length;

  const handleTaskComplete = (task: Task) => {
    if (task.type === 'phone' || task.type === 'linkedin' || task.type === 'whatsapp') {
      setLoggingTask(task);
      setCallOutcome('no_answer');
      setChannelAction('');
      setResponseReceived(false);
      setResponseStage('');
      setActivityNote('');
      setLoggingModalOpen(true);
    } else {
      submitComplete(task.id, 'completed', '', '');
    }
  };

  const submitComplete = async (
    taskId: string,
    status: 'completed' | 'skipped',
    notes: string,
    outcome: string
  ) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes, outcome }),
    });
    if (!res.ok) {
      showToast('Failed to update task', 'error');
      return;
    }
    loadAll();
  };

  const handleLoggingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggingTask) return;
    const task = loggingTask;
    if ((task.type === 'linkedin' || task.type === 'whatsapp') && !channelAction) return;
    const outcome = task.type === 'phone' ? callOutcome : channelAction;
    const noteWithResponse = (task.type === 'linkedin' || task.type === 'whatsapp') && responseReceived
      ? `[Response received] ${activityNote}`.trim()
      : activityNote;
    await submitComplete(task.id, 'completed', noteWithResponse, outcome);
    setLoggingModalOpen(false);
    setLoggingTask(null);

    // Advance stage if response received and SDR chose a new stage
    if (responseStage && (task.type === 'linkedin' || task.type === 'whatsapp')) {
      await fetch(`/api/leads/${task.leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: responseStage }),
      });
      showToast(`Lead moved to ${responseStage.replace(/_/g, ' ')}`, 'success');
    }
    setResponseStage('');

    // Post-log automation
    if (outcome === 'callback_requested') {
      // Auto-create a follow-up call task for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: task.leadId,
          type: 'phone',
          title: `Follow-up call — ${task.lead.firstName} ${task.lead.lastName}`,
          description: `Callback requested. Previous note: ${activityNote || 'none'}`,
          dueDate: tomorrow.toISOString(),
          priority: task.priority,
        }),
      });
      if (res.ok) showToast('Follow-up call task created for tomorrow', 'info');
      loadAll();
    }

    if (outcome === 'connected_meeting_booked') {
      setMeetingPrompt(task);
    }

    if (outcome === 'wrong_number' || outcome === 'do_not_call') {
      const lead = task.lead;
      const existingTags: string[] = (lead as any).tags ?? [];
      const tag = outcome === 'do_not_call' ? 'do_not_call' : 'wrong_number';
      if (!existingTags.includes(tag)) {
        await fetch(`/api/leads/${task.leadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: [...existingTags, tag] }),
        });
      }
      showToast(outcome === 'do_not_call' ? 'Lead flagged as Do Not Call ⛔' : 'Lead flagged as wrong number', 'info');
    }
  };

  const handleConfirmMeetingBooked = async () => {
    if (!meetingPrompt) return;
    const res = await fetch(`/api/leads/${meetingPrompt.leadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'meeting_booked' }),
    });
    if (res.ok) showToast('Lead moved to Meeting Booked 🎉', 'success');
    else showToast('Failed to update stage', 'error');
    setMeetingPrompt(null);
  };

  const handleSkip = async (task: Task) => {
    await submitComplete(task.id, 'skipped', '', '');
  };

  const handleQuickNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNoteTask || !quickNoteText.trim()) return;
    setSavingNote(true);
    const res = await fetch(`/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: quickNoteTask.leadId, content: quickNoteText.trim() }),
    });
    setSavingNote(false);
    if (res.ok) {
      showToast('Note added', 'success');
      setQuickNoteTask(null);
      setQuickNoteText('');
    } else {
      showToast('Failed to save note', 'error');
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTask || !newDueDate) return;
    const res = await fetch(`/api/tasks/${rescheduleTask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueDate: new Date(newDueDate).toISOString() }),
    });
    if (!res.ok) {
      showToast('Failed to reschedule task', 'error');
      return;
    }
    setRescheduleTask(null); setNewDueDate('');
    loadAll();
  };

  const getChannelIcon = (type: Task['type']) => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4 text-blue-500" />;
      case 'phone': return <PhoneCall className="w-4 h-4 text-green-500" />;
      case 'linkedin': return <MessageSquare className="w-4 h-4 text-indigo-500" />;
      case 'whatsapp': return <MessageSquare className="w-4 h-4 text-teal-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getChannelColor = (type: Task['type']) => {
    switch (type) {
      case 'email': return 'bg-blue-500/10 border-blue-500/20';
      case 'phone': return 'bg-green-500/10 border-green-500/20';
      case 'linkedin': return 'bg-indigo-500/10 border-indigo-500/20';
      case 'whatsapp': return 'bg-teal-500/10 border-teal-500/20';
      default: return 'bg-gray-500/10 border-gray-500/20';
    }
  };

  const visibleTasks =
    activeTab === 'today'
      ? todayTasks.filter((t) => t.status === 'pending')
      : activeTab === 'overdue'
      ? overdueTasks
      : yesterdayTasks;

  const sdrUsers = users.filter((u) => u.role === 'sdr');

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      {/* Header */}
      <div className="page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
            {currentRole === 'sdr' ? 'My Daily Tasks' : 'Team Tasks Dashboard'}
          </h1>
          <p className="text-xs text-text-secondary mt-0.5 font-mono">
            <span className="text-text-primary font-semibold">Today: {completedTodayCount} done, {pendingTodayCount} remaining</span>
            {overdueTasks.length > 0 && (
              <span className="ml-2 text-brand-red font-semibold">| Overdue: {overdueTasks.length}</span>
            )}
            <span className="ml-2 text-text-muted">| Yesterday: {yesterdayTasks.filter((t) => t.status === 'completed').length}/{yesterdayTasks.length}</span>
          </p>
        </div>

        {currentRole !== 'sdr' && sdrUsers.length > 0 && (
          <div className="flex items-center gap-2 bg-card-bg border border-card-border p-1.5 rounded-xl self-start sm:self-auto">
            <span className="text-[10px] font-bold font-mono text-text-muted pl-2 uppercase">
              Scope Rep:
            </span>
            <select
              value={selectedSdrId}
              onChange={(e) => setSelectedSdrId(e.target.value)}
              className="bg-background border border-card-border rounded-lg text-xs font-semibold px-2 py-1 text-text-primary focus:outline-none focus:border-brand-red cursor-pointer"
            >
              <option value="all">All Reps</option>
              {sdrUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* KPI Stats — bento grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-container">
        <div className="stagger-child glass-card rounded-2xl p-4 hover-lift flex items-center justify-between group">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-text-muted font-mono tracking-wider">
              Today's Progress
            </span>
            <p className="font-display font-extrabold text-2xl text-text-primary">
              {completedTodayCount}/{completedTodayCount + pendingTodayCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-red/10 border border-brand-red/20 flex items-center justify-center text-brand-red group-hover:scale-110 transition-transform">
            <Check className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        <div className="stagger-child glass-card rounded-2xl p-4 hover-lift flex items-center justify-between group">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-text-muted font-mono tracking-wider">
              Overdue
            </span>
            <p className="font-display font-extrabold text-2xl text-brand-red">
              {overdueTasks.length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-red/10 border border-brand-red/30 flex items-center justify-center text-brand-red group-hover:scale-110 transition-transform">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        <div className="stagger-child glass-card rounded-2xl p-4 hover-lift flex items-center justify-between group">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-text-muted font-mono tracking-wider">
              Yesterday Done
            </span>
            <p className="font-display font-extrabold text-2xl text-text-primary">
              {yesterdayTasks.filter((t) => t.status === 'completed').length}/{yesterdayTasks.length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center text-brand-gold group-hover:scale-110 transition-transform">
            <Award className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        <div className="stagger-child glass-card rounded-2xl p-4 hover-lift flex items-center justify-between group">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-text-muted font-mono tracking-wider">
              Activities Today
            </span>
            <p className="font-display font-extrabold text-2xl text-text-primary">
              {
                activities.filter((a) => {
                  const d = new Date(a.createdAt);
                  const now = new Date();
                  return d.toDateString() === now.toDateString();
                }).length
              }
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
            <Users className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
        {/* Task Hub */}
        <div className="lg:col-span-2 glass-card rounded-2xl overflow-hidden flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 border-b border-card-border bg-background/25 gap-3">
            <div className="flex gap-2">
              {(['today', 'overdue', 'yesterday'] as const).map((tab) => {
                const count =
                  tab === 'today'
                    ? pendingTodayCount
                    : tab === 'overdue'
                    ? overdueTasks.length
                    : yesterdayTasks.length;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all capitalize ${
                      activeTab === tab
                        ? 'bg-brand-red/10 text-brand-red border-brand-red/25'
                        : 'bg-transparent text-text-secondary border-transparent hover:text-text-primary'
                    }`}
                  >
                    {tab}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        tab === 'overdue' && count > 0
                          ? 'bg-brand-red/10 text-brand-red font-bold'
                          : 'bg-card-border text-text-secondary'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-card-border max-h-[520px] overflow-y-auto stagger-container">
            {visibleTasks.length === 0 && (
              <div className="p-10 text-center text-xs text-text-muted space-y-2">
                <p className="text-xl">
                  {activeTab === 'overdue' ? '✅' : '🎉'}
                </p>
                <p className="font-semibold text-text-primary">
                  {activeTab === 'today'
                    ? 'All done for today!'
                    : activeTab === 'overdue'
                    ? 'No overdue tasks!'
                    : 'No tasks from yesterday.'}
                </p>
              </div>
            )}

            {visibleTasks.map((task) => {
              const isHot = task.lead?.priority === 'hot';
              return (
                <div
                  key={task.id}
                  className={`stagger-child p-4 transition-all hover:bg-background/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative group`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 mt-0.5 ${getChannelColor(task.type)}`}
                    >
                      {getChannelIcon(task.type)}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setSelectedLeadId(task.lead?.id)}
                          className="font-display font-extrabold text-xs text-text-primary hover:text-brand-red hover:underline text-left"
                        >
                          {task.lead?.firstName} {task.lead?.lastName}
                        </button>
                        <span className="text-[10px] text-text-muted font-mono">
                          at {task.lead?.company}
                        </span>
                        {isHot && (
                          <span className="bg-brand-red/10 border border-brand-red/30 text-brand-red text-[8px] font-extrabold px-1.5 rounded font-mono">
                            HOT LEAD
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-xs text-text-primary truncate">
                        {task.title}
                      </p>
                      <p className="text-[11px] text-text-secondary leading-normal pr-4">
                        {task.description}
                      </p>
                      {activeTab === 'overdue' && (
                        <span className="inline-block text-[9px] font-semibold text-brand-red font-mono bg-brand-red/5 px-2 py-0.5 border border-brand-red/10 rounded mt-1">
                          ⚠️ Action Overdue
                        </span>
                      )}
                      {task.type === 'phone' && task.lead?.tags?.includes('do_not_call') && (
                        <span className="inline-block text-[9px] font-semibold text-brand-red font-mono bg-brand-red/5 px-2 py-0.5 border border-brand-red/20 rounded mt-1">
                          ⛔ Do Not Call — prospect requested
                        </span>
                      )}
                      {task.type === 'phone' && !task.lead?.tags?.includes('do_not_call') && task.lead?.tags?.includes('wrong_number') && (
                        <span className="inline-block text-[9px] font-semibold text-amber-600 font-mono bg-amber-500/5 px-2 py-0.5 border border-amber-500/20 rounded mt-1">
                          ⚠️ Wrong number previously logged
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto flex-shrink-0">
                    {task.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => handleTaskComplete(task)}
                          className="px-2.5 py-1.5 bg-green-500/10 border border-green-500/20 text-green-500 hover:bg-green-500 hover:text-white rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold font-mono active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {['phone', 'linkedin', 'whatsapp'].includes(task.type)
                              ? 'Log & Complete'
                              : 'Complete'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleSkip(task)}
                          className="p-1.5 bg-card-border/30 hover:bg-card-border text-text-secondary rounded-lg transition-all active:scale-95"
                          title="Skip task"
                          aria-label="Skip task"
                        >
                          <ChevronsRight className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => {
                            setQuickNoteTask(quickNoteTask?.id === task.id ? null : task);
                            setQuickNoteText('');
                          }}
                          className={`p-1.5 rounded-lg transition-all active:scale-95 ${quickNoteTask?.id === task.id ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-card-border/30 hover:bg-card-border text-text-secondary'}`}
                          title="Add note to lead"
                          aria-label="Quick note"
                        >
                          <FileText className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => {
                            setRescheduleTask(task);
                            setNewDueDate('');
                          }}
                          className="p-1.5 bg-card-border/30 hover:bg-card-border text-text-secondary rounded-lg transition-all active:scale-95"
                          title="Reschedule"
                          aria-label="Reschedule task"
                        >
                          <Clock className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <span
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-extrabold font-mono border ${
                          task.status === 'completed'
                            ? 'bg-green-500/15 text-green-500 border-green-500/20'
                            : 'bg-card-border text-text-muted border-transparent'
                        }`}
                      >
                        {task.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {/* Quick Note inline form */}
                  {quickNoteTask?.id === task.id && (
                    <form onSubmit={handleQuickNoteSubmit} className="mt-2 flex gap-2 w-full sm:col-span-full">
                      <input
                        type="text"
                        value={quickNoteText}
                        onChange={(e) => setQuickNoteText(e.target.value)}
                        placeholder={`Add note for ${task.lead?.firstName}…`}
                        autoFocus
                        className="flex-1 bg-background border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        disabled={savingNote || !quickNoteText.trim()}
                        className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 rounded-lg text-[10px] font-bold font-mono transition-colors disabled:opacity-50"
                      >
                        {savingNote ? '…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setQuickNoteTask(null); setQuickNoteText(''); }}
                        className="px-2 py-1.5 text-text-muted hover:text-text-primary text-[10px] transition-colors"
                      >
                        ✕
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: SDR personal stats (SDR only) + Activity Feed */}
        <div className="space-y-6">
          {currentRole === 'sdr' && (
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
                <Award className="w-5 h-5 text-brand-gold" aria-hidden="true" />
                <span>My Performance</span>
              </h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Calls', count: activities.filter((a) => a.type === 'call_logged').length, color: 'text-emerald-500' },
                  { label: 'Emails', count: activities.filter((a) => a.type === 'email_sent').length, color: 'text-blue-500' },
                  { label: 'LinkedIn', count: activities.filter((a) => a.type === 'linkedin_touch').length, color: 'text-indigo-500' },
                ].map(({ label, count, color }) => (
                  <div key={label} className="bg-background/60 border border-card-border rounded-xl p-3">
                    <p className={`font-display font-extrabold text-xl ${color}`}>{count}</p>
                    <span className="text-[10px] uppercase font-mono text-text-muted">{label}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 text-xs">
                <p className="text-[10px] font-bold font-mono text-text-muted uppercase">Pipeline Summary</p>
                {(() => {
                  const stages = ['new', 'sequence_active', 'replied', 'meeting_booked', 'won', 'lost'] as const;
                  const totalLeads = stages.reduce((s, st) => s + (sdrPipelineCounts[st] ?? 0), 0) || 1;
                  const labels: Record<string, string> = { new: 'New', sequence_active: 'Active', replied: 'Replied', meeting_booked: 'Meeting', won: 'Won', lost: 'Lost' };
                  const colors: Record<string, string> = { new: 'bg-text-muted/50', sequence_active: 'bg-blue-500', replied: 'bg-amber-500', meeting_booked: 'bg-emerald-500', won: 'bg-green-500', lost: 'bg-brand-red' };
                  return stages.filter((st) => (sdrPipelineCounts[st] ?? 0) > 0 || ['new','sequence_active','replied','meeting_booked'].includes(st)).map((stage) => {
                    const count = sdrPipelineCounts[stage] ?? 0;
                    const pct = Math.round((count / totalLeads) * 100);
                    return (
                      <div key={stage} className="flex items-center gap-2">
                        <span className="text-[10px] w-16 text-text-muted font-mono">{labels[stage]}</span>
                        <div className="flex-1 h-1.5 bg-card-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[stage]} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-text-muted w-5 text-right">{count}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          <div className="glass-card rounded-2xl p-5 hover-lift space-y-4">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <BarChart className="w-5 h-5 text-brand-orange" aria-hidden="true" />
              <span>Recent Activity Feed</span>
            </h3>
            <div className="space-y-4 max-h-[320px] overflow-y-auto pr-1">
              {activities.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-4">
                  No activities logged yet.
                </p>
              ) : (
                activities.map((act) => (
                  <div key={act.id} className="flex gap-2.5 text-xs pb-1">
                    <span className="text-sm mt-0.5">
                      {act.type === 'meeting_booked'
                        ? '🎉'
                        : act.type === 'email_sent'
                        ? '📧'
                        : act.type === 'call_logged'
                        ? '📞'
                        : act.type === 'linkedin_touch'
                        ? '💼'
                        : '⚡'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-text-primary leading-normal">
                        <span className="font-semibold">{act.user?.firstName}</span>{' '}
                        {act.description}
                      </p>
                      {act.metadata?.outcome && (
                        <p className="text-[10px] text-text-muted font-mono mt-0.5">
                          Outcome: {act.metadata.outcome}
                        </p>
                      )}
                      <span className="text-[9px] text-text-muted font-mono block mt-0.5">
                        {new Date(act.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <LeadDetailPanel leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />

      {/* Meeting Booked follow-up prompt */}
      {meetingPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMeetingPrompt(null)} />
          <div className="relative glass-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" role="dialog" aria-modal="true">
            <div className="text-center space-y-2">
              <span className="text-4xl">🎉</span>
              <h2 className="font-display font-bold text-base text-text-primary">Meeting Booked!</h2>
              <p className="text-xs text-text-secondary leading-relaxed">
                Move <span className="font-semibold text-text-primary">{meetingPrompt.lead.firstName} {meetingPrompt.lead.lastName}</span> to <span className="text-emerald-500 font-semibold">Meeting Booked</span> stage?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setMeetingPrompt(null)}
                className="flex-1 py-2 text-xs font-semibold text-text-muted hover:text-text-primary border border-card-border rounded-lg transition-colors"
              >
                Not yet
              </button>
              <button
                onClick={handleConfirmMeetingBooked}
                className="flex-1 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition-colors"
              >
                Yes, move stage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call / Activity Logging Modal */}
      {loggingModalOpen && loggingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setLoggingModalOpen(false)}
          />
          <form
            onSubmit={handleLoggingSubmit}
            className="glass-card rounded-2xl shadow-xl w-full max-w-md relative z-10 p-5 space-y-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display font-bold text-base text-text-primary">
                  {loggingTask.type === 'phone' ? '📞 Log Call' : loggingTask.type === 'linkedin' ? '💼 Log LinkedIn Touch' : '💬 Log WhatsApp Touch'}
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  <span className="font-semibold">{loggingTask.lead.firstName} {loggingTask.lead.lastName}</span>
                  <span className="text-text-muted"> · {loggingTask.lead.company}</span>
                </p>
              </div>
            </div>

            {/* Phone-specific: call outcome */}
            {loggingTask.type === 'phone' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Call Outcome <span className="text-brand-red">*</span></label>
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red"
                >
                  <option value="no_answer">No Answer</option>
                  <option value="voicemail_left">Voicemail Left</option>
                  <option value="voicemail_not_left">Went to Voicemail — No Message</option>
                  <option value="connected_interested">Connected — Interested</option>
                  <option value="connected_not_interested">Connected — Not Interested</option>
                  <option value="connected_meeting_booked">Connected — Meeting Booked 🎉</option>
                  <option value="callback_requested">Callback Requested</option>
                  <option value="wrong_number">Wrong Number</option>
                  <option value="do_not_call">Do Not Call (Requested)</option>
                </select>
                {callOutcome === 'callback_requested' && (
                  <p className="text-[10px] text-brand-orange font-mono">→ A follow-up call task will be auto-created for tomorrow.</p>
                )}
                {callOutcome === 'connected_meeting_booked' && (
                  <p className="text-[10px] text-emerald-500 font-mono">→ You'll be prompted to move this lead to Meeting Booked.</p>
                )}
                {callOutcome === 'do_not_call' && (
                  <p className="text-[10px] text-brand-red font-mono">⛔ Lead will be flagged DNC — all future phone tasks will show a warning.</p>
                )}
              </div>
            )}

            {/* LinkedIn-specific: action type */}
            {loggingTask.type === 'linkedin' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Action Type <span className="text-brand-red">*</span></label>
                <select
                  value={channelAction}
                  onChange={(e) => setChannelAction(e.target.value)}
                  required
                  className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-indigo-500"
                >
                  <option value="">— Select action —</option>
                  <option value="connection_request">Connection Request Sent</option>
                  <option value="inmail">InMail Sent</option>
                  <option value="follow_up_message">Follow-up Message</option>
                  <option value="commented_on_post">Commented on Post</option>
                  <option value="voice_note">Voice Note</option>
                  <option value="profile_view_bait">Profile View (Bait)</option>
                </select>
              </div>
            )}

            {/* WhatsApp-specific: action type */}
            {loggingTask.type === 'whatsapp' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Message Type <span className="text-brand-red">*</span></label>
                <select
                  value={channelAction}
                  onChange={(e) => setChannelAction(e.target.value)}
                  required
                  className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-teal-500"
                >
                  <option value="">— Select type —</option>
                  <option value="first_message">First Message</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="voice_note">Voice Note</option>
                  <option value="document_sent">Document / Deck Sent</option>
                  <option value="video_message">Video Message</option>
                </select>
              </div>
            )}

            {/* LinkedIn / WhatsApp: response toggle + stage advance */}
            {(loggingTask.type === 'linkedin' || loggingTask.type === 'whatsapp') && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setResponseReceived((v) => !v); setResponseStage(''); }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${responseReceived ? 'bg-emerald-500' : 'bg-card-border'}`}
                    aria-pressed={responseReceived}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${responseReceived ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                  <label className="text-xs text-text-secondary cursor-pointer" onClick={() => { setResponseReceived((v) => !v); setResponseStage(''); }}>
                    Response received from prospect
                  </label>
                </div>
                {responseReceived && (
                  <div className="pl-12">
                    <label className="text-[10px] font-mono text-text-muted uppercase block mb-1">Advance lead stage?</label>
                    <select
                      value={responseStage}
                      onChange={(e) => setResponseStage(e.target.value)}
                      className="w-full bg-background border border-emerald-500/30 rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">— Keep current stage —</option>
                      <option value="replied">Replied</option>
                      <option value="meeting_booked">Meeting Booked</option>
                      <option value="won">Won</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Notes — all channels */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Notes</label>
              <textarea
                placeholder={
                  loggingTask.type === 'phone'
                    ? 'Prospect reaction, key objections, next steps...'
                    : loggingTask.type === 'linkedin'
                    ? 'What was communicated, prospect engagement...'
                    : 'Message content, prospect response...'
                }
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                className="w-full bg-background border border-card-border rounded-lg p-2.5 text-xs text-text-primary focus:outline-none focus:border-brand-red h-20 placeholder-text-muted resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>Submit &amp; Mark Complete</span>
            </button>
          </form>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setRescheduleTask(null); setNewDueDate(''); }}
          />
          <form
            onSubmit={handleRescheduleSubmit}
            className="bg-card-bg border border-card-border rounded-2xl shadow-xl w-full max-w-sm relative z-10 p-5 space-y-4"
          >
            <h2 className="font-display font-bold text-base text-text-primary flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-orange" /> Reschedule Task
            </h2>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                New Due Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setRescheduleTask(null); setNewDueDate(''); }}
                className="flex-1 py-2 bg-card-border/30 hover:bg-card-border/50 text-text-secondary text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg"
              >
                Save Schedule
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
