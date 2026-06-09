'use client';

import { useState, useEffect } from 'react';
import {
  BarChart as BarChartIcon,
  TrendingUp,
  Download,
  AlertTriangle,
  Award,
  ShieldAlert,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
} from 'recharts';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';

interface TeamData {
  stageCounts: Record<string, number>;
  activityCounts: { userId: string; type: string; _count: { id: number } }[];
  users: { id: string; firstName: string; lastName: string; role: string }[];
  overdueByUser: Record<string, number>;
  sequenceStats: { id: string; name: string; _count: { leads: number }; repliedCount: number; replyRate: number }[];
}

export default function TeamViewPage() {
  const { currentRole } = useAppContext();
  const { showToast } = useToast();
  const [data, setData] = useState<TeamData | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState('cmp1');
  const [isExporting, setIsExporting] = useState(false);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('week');
  const [filterSdr, setFilterSdr] = useState('');
  const [filterManager, setFilterManager] = useState('');

  useEffect(() => {
    if (currentRole === 'sdr') return;
    const params = new URLSearchParams({ dateRange });
    if (filterSdr) params.set('sdrId', filterSdr);
    if (filterManager) params.set('managerId', filterManager);
    fetch(`/api/team?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [currentRole, dateRange, filterSdr, filterManager]);

  if (currentRole === 'sdr') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md mx-auto my-12 animate-in fade-in duration-300">
        <div className="w-16 h-16 bg-brand-red/10 border border-brand-red/25 rounded-2xl flex items-center justify-center text-brand-red">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="font-display font-extrabold text-lg text-text-primary">Manager Access Only</h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          The Team View dashboard is restricted to Directors, Floor Managers, and Team Leads.
        </p>
        <div className="bg-brand-red/5 border border-brand-red/10 p-3 rounded-xl text-[10px] text-text-secondary leading-normal font-mono">
          💡 Use the Persona Switcher in the Topbar to switch to Director View and unlock this dashboard.
        </div>
      </div>
    );
  }

  const stageCounts = data?.stageCounts ?? {};
  const totalLeads = Object.values(stageCounts).reduce((a, b) => a + b, 0) || 1;
  const users = data?.users ?? [];
  const overdueByUser = data?.overdueByUser ?? {};
  const activityCounts = data?.activityCounts ?? [];

  // Build leaderboard rows from activityCounts
  const repStats = users.map((u) => {
    const getCount = (type: string) =>
      activityCounts
        .filter((a) => a.userId === u.id && a.type === type)
        .reduce((sum, a) => sum + a._count.id, 0);
    return {
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role.replace('_', ' '),
      calls: getCount('call_logged'),
      emails: getCount('email_sent'),
      linkedin: getCount('linkedin_touch'),
      whatsapp: getCount('whatsapp_message'),
      booked: getCount('meeting_booked'),
    };
  }).sort((a, b) => b.booked - a.booked || b.calls + b.emails - (a.calls + a.emails));

  const stageChartData = [
    { name: 'New', value: stageCounts['new'] ?? 0, color: '#9CA3AF' },
    { name: 'Seq Active', value: stageCounts['sequence_active'] ?? 0, color: '#3B82F6' },
    { name: 'Replied', value: stageCounts['replied'] ?? 0, color: '#E8611A' },
    { name: 'Booked', value: stageCounts['meeting_booked'] ?? 0, color: '#F5A623' },
    { name: 'Won', value: stageCounts['won'] ?? 0, color: '#22C55E' },
    { name: 'Lost', value: stageCounts['lost'] ?? 0, color: '#D42B1E' },
  ].filter((d) => d.value > 0);

  const activityByType = [
    { name: 'Calls', value: repStats.reduce((s, r) => s + r.calls, 0), color: '#22C55E' },
    { name: 'Emails', value: repStats.reduce((s, r) => s + r.emails, 0), color: '#3B82F6' },
    { name: 'LinkedIn', value: repStats.reduce((s, r) => s + r.linkedin, 0), color: '#6366F1' },
    { name: 'WhatsApp', value: repStats.reduce((s, r) => s + r.whatsapp, 0), color: '#10B981' },
    { name: 'Meetings', value: repStats.reduce((s, r) => s + r.booked, 0), color: '#F5A623' },
  ];

  const escHtml = (s: string | number) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const handleExportPDF = () => {
    const campaignLabels: Record<string, string> = {
      cmp1: 'Acme ERP Outreach',
      cmp2: 'PayFlow SMB Retail',
      cmp3: 'Logix Supply Chain',
    };
    const campaignName = escHtml(campaignLabels[selectedCampaign] ?? selectedCampaign);
    const totalCalls = repStats.reduce((s, r) => s + r.calls, 0);
    const totalEmails = repStats.reduce((s, r) => s + r.emails, 0);
    const totalLinkedIn = repStats.reduce((s, r) => s + r.linkedin, 0);
    const totalWhatsApp = repStats.reduce((s, r) => s + r.whatsapp, 0);
    const totalBooked = repStats.reduce((s, r) => s + r.booked, 0);
    const generatedAt = new Date().toLocaleString();

    const pipelineRows = [
      ['New', stageCounts['new'] ?? 0],
      ['Sequence Active', stageCounts['sequence_active'] ?? 0],
      ['Replied', stageCounts['replied'] ?? 0],
      ['Meeting Booked', stageCounts['meeting_booked'] ?? 0],
      ['Won', stageCounts['won'] ?? 0],
      ['Lost', stageCounts['lost'] ?? 0],
    ].filter(([, v]) => (v as number) > 0);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Telestar Client Report — ${escHtml(campaignLabels[selectedCampaign] ?? selectedCampaign)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #111; background: #fff; padding: 32px 40px; }
  h1 { font-size: 20px; font-weight: 800; color: #D42B1E; margin-bottom: 2px; }
  .sub { font-size: 11px; color: #666; margin-bottom: 24px; }
  h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #333; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 20px 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #555; border-bottom: 1px solid #e5e7eb; }
  td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; }
  tr:last-child td { border-bottom: none; }
  .highlight td:first-child { font-weight: 700; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .badge-won { background: #dcfce7; color: #166534; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #999; }
  @media print { body { padding: 16px 20px; } }
</style>
</head>
<body>
<h1>TeleStar SDR — Campaign Report</h1>
<p class="sub">Campaign: <strong>${campaignName}</strong> &nbsp;·&nbsp; Generated: ${generatedAt}</p>

<h2>Pipeline Overview</h2>
<table>
  <thead><tr><th>Stage</th><th>Leads</th><th>% of Total</th></tr></thead>
  <tbody>
    ${pipelineRows.map(([stage, count]) => `
      <tr><td>${stage}</td><td><strong>${count}</strong></td><td>${Math.round(((count as number) / totalLeads) * 100)}%</td></tr>
    `).join('')}
  </tbody>
</table>

<h2>Outreach Activity — ${dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'This Week' : 'This Month'}</h2>
<table>
  <thead><tr><th>Channel</th><th>Total Actions</th></tr></thead>
  <tbody>
    <tr><td>📞 Calls</td><td><strong>${totalCalls}</strong></td></tr>
    <tr><td>📧 Emails</td><td><strong>${totalEmails}</strong></td></tr>
    <tr><td>💼 LinkedIn</td><td><strong>${totalLinkedIn}</strong></td></tr>
    <tr><td>💬 WhatsApp</td><td><strong>${totalWhatsApp}</strong></td></tr>
    <tr class="highlight"><td>🎉 Meetings Booked</td><td><strong style="color:#166534">${totalBooked}</strong></td></tr>
  </tbody>
</table>

<h2>Rep Leaderboard</h2>
<table>
  <thead><tr><th>#</th><th>Name</th><th>Calls</th><th>Emails</th><th>LinkedIn</th><th>WhatsApp</th><th>Meetings</th></tr></thead>
  <tbody>
    ${repStats.map((r, i) => `
      <tr>
        <td style="color:#999;font-size:10px">${i + 1}</td>
        <td><strong>${escHtml(r.name)}</strong></td>
        <td>${r.calls}</td>
        <td>${r.emails}</td>
        <td>${r.linkedin}</td>
        <td>${r.whatsapp}</td>
        <td><strong style="color:${r.booked > 0 ? '#166534' : '#111'}">${r.booked}</strong></td>
      </tr>
    `).join('')}
  </tbody>
</table>

${data?.sequenceStats && data.sequenceStats.length > 0 ? `
<h2>Sequence Performance</h2>
<table>
  <thead><tr><th>Sequence</th><th>Enrolled</th><th>Replied/Advanced</th><th>Reply Rate</th></tr></thead>
  <tbody>
    ${data.sequenceStats.map((s) => `
      <tr>
        <td>${escHtml(s.name)}</td>
        <td>${s._count.leads}</td>
        <td>${s.repliedCount}</td>
        <td><strong>${s.replyRate}%</strong></td>
      </tr>
    `).join('')}
  </tbody>
</table>
` : ''}

<div class="footer">
  Confidential — Prepared by TeleStar SDR Team &nbsp;·&nbsp; ${new Date().toLocaleDateString()}
</div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { showToast('Pop-up blocked — allow pop-ups for PDF export', 'error'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
    showToast('Print dialog opened — choose "Save as PDF"', 'success');
  };

  const handleExportReport = () => {
    setIsExporting(true);

    const campaignLabels: Record<string, string> = {
      cmp1: 'Acme ERP Outreach',
      cmp2: 'PayFlow SMB Retail',
      cmp3: 'Logix Supply Chain',
    };
    const campaignName = campaignLabels[selectedCampaign] ?? selectedCampaign;

    const totalCalls = repStats.reduce((s, r) => s + r.calls, 0);
    const totalEmails = repStats.reduce((s, r) => s + r.emails, 0);
    const totalLinkedIn = repStats.reduce((s, r) => s + r.linkedin, 0);
    const totalWhatsApp = repStats.reduce((s, r) => s + r.whatsapp, 0);
    const totalBooked = repStats.reduce((s, r) => s + r.booked, 0);

    const rows: string[][] = [
      ['Telestar SDR — Campaign Performance Report'],
      ['Campaign', campaignName],
      ['Generated', new Date().toLocaleString()],
      [],
      ['PIPELINE OVERVIEW'],
      ['Stage', 'Lead Count'],
      ['New', String(stageCounts['new'] ?? 0)],
      ['Sequence Active', String(stageCounts['sequence_active'] ?? 0)],
      ['Replied', String(stageCounts['replied'] ?? 0)],
      ['Meeting Booked', String(stageCounts['meeting_booked'] ?? 0)],
      ['Won', String(stageCounts['won'] ?? 0)],
      ['Lost', String(stageCounts['lost'] ?? 0)],
      [],
      ['OUTREACH ACTIVITY TOTALS'],
      ['Channel', 'Actions'],
      ['Calls', String(totalCalls)],
      ['Emails', String(totalEmails)],
      ['LinkedIn', String(totalLinkedIn)],
      ['WhatsApp', String(totalWhatsApp)],
      [],
      ['MEETINGS BOOKED', String(totalBooked)],
    ];

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telestar-${selectedCampaign}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsExporting(false);
    showToast(`Client report for "${campaignName}" downloaded.`, 'success');
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col animate-in fade-in duration-200">
      <div className="page-hero">
        <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
          Organization Team View
        </h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Aggregate coaching leaderboards, pipeline analysis, and client report exports.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card-bg border border-card-border rounded-2xl px-4 py-3 shadow-sm">
        {/* Date range */}
        <div className="flex bg-background border border-card-border rounded-lg p-0.5 gap-0.5">
          {(['today', 'week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1 rounded text-[10px] font-bold font-mono capitalize transition-all ${dateRange === r ? 'bg-brand-red text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
            >
              {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>

        {/* Pod filter (Team Lead / Floor Manager) */}
        {users.filter((u) => u.role === 'team_lead' || u.role === 'floor_manager').length > 0 && (
          <select
            value={filterManager}
            onChange={(e) => { setFilterManager(e.target.value); setFilterSdr(''); }}
            className="bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red font-mono"
          >
            <option value="">All Pods</option>
            {users.filter((u) => u.role === 'floor_manager').map((u) => (
              <option key={u.id} value={u.id}>FM: {u.firstName} {u.lastName}</option>
            ))}
            {users.filter((u) => u.role === 'team_lead').map((u) => (
              <option key={u.id} value={u.id}>TL: {u.firstName} {u.lastName}</option>
            ))}
          </select>
        )}

        {/* SDR filter */}
        <select
          value={filterSdr}
          onChange={(e) => { setFilterSdr(e.target.value); setFilterManager(''); }}
          className="bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red font-mono"
        >
          <option value="">All SDRs</option>
          {users.filter((u) => u.role === 'sdr').map((u) => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>

        {(filterSdr || filterManager) && (
          <button onClick={() => { setFilterSdr(''); setFilterManager(''); }} className="text-[10px] font-mono text-text-muted hover:text-brand-red transition-colors">
            Clear filter ✕
          </button>
        )}

        <span className="ml-auto text-[10px] font-mono text-text-muted">
          {filterSdr ? `Showing: ${users.find((u) => u.id === filterSdr)?.firstName ?? '?'}'s data` : 'Showing: whole team'}
          {' · '}{dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'This week' : 'This month'}
        </span>
      </div>

      {/* Bento KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-container">
        {[
          {
            label: 'Meetings Booked',
            value: repStats.reduce((s, r) => s + r.booked, 0),
            Icon: Award,
            color: 'text-brand-gold',
            bg: 'bg-brand-gold/10',
            border: 'border-brand-gold/20',
          },
          {
            label: 'Total Calls',
            value: repStats.reduce((s, r) => s + r.calls, 0),
            Icon: BarChartIcon,
            color: 'text-green-500',
            bg: 'bg-green-500/10',
            border: 'border-green-500/20',
          },
          {
            label: 'Org Overdue',
            value: Object.values(overdueByUser).reduce((s, n) => s + n, 0),
            Icon: AlertTriangle,
            color: 'text-brand-red',
            bg: 'bg-brand-red/10',
            border: 'border-brand-red/20',
          },
          {
            label: 'Active Reps',
            value: users.length,
            Icon: TrendingUp,
            color: 'text-blue-500',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20',
          },
        ].map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} className="stagger-child glass-card rounded-2xl p-4 hover-lift flex items-center justify-between group">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-text-muted font-mono tracking-wider">{label}</span>
              <p className={`font-display font-extrabold text-2xl ${color}`}>{value}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl ${bg} border ${border} flex items-center justify-center ${color} group-hover:scale-110 transition-transform`}>
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Leaderboard */}
        <div className="lg:col-span-2 glass-card rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-card-border bg-background/25 flex items-center justify-between">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <Award className="w-5 h-5 text-brand-red" />
              <span>SDR Activity Leaderboard</span>
            </h3>
            <span className="text-[10px] font-mono text-text-muted">{dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'This week' : 'This month'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
                  <th className="p-3">Rep Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-center">Calls</th>
                  <th className="p-3 text-center">Emails</th>
                  <th className="p-3 text-center">LinkedIn</th>
                  <th className="p-3 text-center">WhatsApp</th>
                  <th className="p-3 text-center text-brand-gold">Booked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border text-text-secondary">
                {repStats.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-text-muted">
                      No activity data yet.
                    </td>
                  </tr>
                ) : (
                  repStats.map((rep, idx) => (
                    <tr key={rep.id} className="hover:bg-background/40 table-row-dense">
                      <td className="p-3 font-semibold text-text-primary">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center font-mono font-bold text-[10px]">
                            {idx + 1}
                          </span>
                          {rep.name}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-[10px] text-text-muted capitalize">
                        {rep.role}
                      </td>
                      <td className="p-3 text-center font-medium font-mono">{rep.calls}</td>
                      <td className="p-3 text-center font-medium font-mono">{rep.emails}</td>
                      <td className="p-3 text-center font-medium font-mono">{rep.linkedin}</td>
                      <td className="p-3 text-center font-medium font-mono">{rep.whatsapp}</td>
                      <td className="p-3 text-center font-bold font-mono text-brand-gold bg-brand-gold/[0.02]">
                        {rep.booked}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overdue Alerts */}
        <div className="glass-card rounded-2xl p-5 hover-lift space-y-4">
          <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-brand-red" />
            <span>Overdue Tasks Monitor</span>
          </h3>
          <div className="space-y-3">
            {users.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No data yet.</p>
            ) : (
              users.map((u) => {
                const count = overdueByUser[u.id] ?? 0;
                return (
                  <div
                    key={u.id}
                    className={`p-3 border rounded-xl flex items-center justify-between gap-3 text-xs bg-background/20 ${
                      count > 0 ? 'border-brand-red/30' : 'border-card-border'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-text-primary">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5 font-mono capitalize">
                        {u.role.replace('_', ' ')}
                      </p>
                    </div>
                    {count > 0 ? (
                      <span className="px-2 py-0.5 bg-brand-red/10 border border-brand-red/20 text-brand-red text-[10px] font-bold rounded-lg font-mono">
                        {count} OVERDUE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-lg font-mono">
                        CLEAN
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-5 hover-lift space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-brand-red" aria-hidden="true" />
              <span>Pipeline Stage Distribution</span>
            </h3>
            <span className="text-[10px] font-mono text-text-muted">Direct channels</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
            {stageChartData.length > 0 ? (
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={stageChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={58}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stageChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--card-border)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-[140px] h-[140px] flex items-center justify-center text-text-muted text-xs">No data</div>
            )}
            <div className="space-y-2 text-xs flex-1 max-w-[200px]">
              {stageChartData.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: entry.color }} />
                    {entry.name}
                  </span>
                  <span className="font-bold text-text-primary font-mono">
                    {totalLeads > 0 ? Math.round((entry.value / totalLeads) * 100) : 0}%
                  </span>
                </div>
              ))}
              {stageChartData.length === 0 && (
                <p className="text-text-muted">No leads yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 hover-lift space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <BarChartIcon className="w-5 h-5 text-brand-orange" aria-hidden="true" />
              <span>Weekly Team Outreach Activity</span>
            </h3>
            <span className="text-[10px] font-mono text-text-muted">
              Total: {activityCounts.reduce((sum, a) => sum + a._count.id, 0)} actions
            </span>
          </div>
          <div className="py-2">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={activityByType} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fontFamily: 'monospace', fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fontFamily: 'monospace', fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--card-border)',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  cursor={{ fill: 'rgba(128,128,128,0.05)' }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {activityByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Pipeline Funnel + Export */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 hover-lift space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-orange" />
              <span>Conversion Pipeline Funnel</span>
            </h3>
            <span className="text-[10px] font-mono text-text-muted">Total leads: {totalLeads}</span>
          </div>
          <div className="space-y-3">
            {[
              { key: 'new', label: '1. New Leads', color: 'bg-gray-500/60' },
              { key: 'sequence_active', label: '2. Sequence Active', color: 'bg-blue-500' },
              { key: 'replied', label: '3. Replied / Engaged', color: 'bg-brand-orange' },
              { key: 'meeting_booked', label: '4. Meeting Booked', color: 'bg-brand-gold' },
            ].map(({ key, label, color }) => {
              const count = stageCounts[key] ?? 0;
              const pct = Math.round((count / totalLeads) * 100);
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-text-secondary">{label}</span>
                    <span className="font-semibold text-text-primary">
                      {count} leads ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-background border border-card-border h-4 rounded overflow-hidden">
                    <div className={`${color} h-full rounded`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 hover-lift flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <Download className="w-5 h-5 text-brand-orange" />
              <span>BPO Client Exporter</span>
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Export campaign outbound reports for clients. Hides internal metrics automatically.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-[10px] font-bold font-mono text-text-muted uppercase block mb-1">
                Select Campaign
              </label>
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red cursor-pointer"
              >
                <option value="cmp1">Acme ERP Outreach</option>
                <option value="cmp2">PayFlow SMB Retail</option>
                <option value="cmp3">Logix Supply Chain</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportReport}
                disabled={isExporting}
                aria-label="Download client report as CSV"
                className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover disabled:bg-brand-red/70 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-[0.98]"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting ? 'Compiling...' : 'CSV'}
              </button>
              <button
                onClick={handleExportPDF}
                aria-label="Export client report as PDF"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-[0.98]"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                PDF
              </button>
            </div>

            {/* Active Sequences */}
            {data?.sequenceStats && data.sequenceStats.length > 0 && (
              <div className="pt-3 border-t border-card-border space-y-2">
                <p className="text-[10px] font-bold font-mono text-text-muted uppercase">
                  Active Sequences
                </p>
                {data.sequenceStats.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-[11px] gap-2">
                    <span className="text-text-secondary truncate flex-1">{s.name}</span>
                    <span className="font-mono text-brand-orange font-semibold flex-shrink-0">
                      {s._count?.leads ?? 0} leads
                    </span>
                    <span className={`font-mono font-bold flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                      s.replyRate >= 30 ? 'text-emerald-600 bg-emerald-500/10' :
                      s.replyRate >= 15 ? 'text-amber-600 bg-amber-500/10' :
                      'text-text-muted bg-card-border'
                    }`}>
                      {s.replyRate}% reply
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
