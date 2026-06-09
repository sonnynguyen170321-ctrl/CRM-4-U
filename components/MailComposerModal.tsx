'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Send, X, AlertCircle } from 'lucide-react';
interface Task { id: string; type: string; title: string; description: string; dueDate: string; status: string; leadId: string; }
interface Lead { id: string; firstName: string; lastName: string; company: string; title: string; email: string; phone?: string; }

interface MailComposerModalProps {
  task: Task;
  lead: Lead;
  onClose: () => void;
  onSend: (note: string) => void;
}

export default function MailComposerModal({ task: _task, lead, onClose, onSend }: MailComposerModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/templates').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/email/accounts').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([templates, accounts]: [{ channel: string; subject?: string | null; body: string }[], any[]]) => {
        const activeAccount = Array.isArray(accounts) ? accounts[0] : null;
        setConnectedEmail(activeAccount?.email ?? null);

        const template = templates.find((t) => t.channel === 'email') ?? templates[0];
        if (!template) return;

        const replacements: Record<string, string> = {
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.company,
          title: lead.title,
          email: lead.email,
          phone: lead.phone || 'your phone number',
          sdrName: 'SDR',
          sdrTitle: 'Sales Development Representative',
        };

        const substitute = (str: string) =>
          Object.entries(replacements).reduce(
            (s, [k, v]) => s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v),
            str
          );

        setSubject(substitute(template.subject ?? 'Follow up - Telestar SDR'));
        setBody(substitute(template.body));
      })
      .catch(() => {
        setSubject('Follow up - Telestar SDR');
      });
  }, [lead]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(`Sent email: "${subject}"\n\nContent:\n${body}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal Dialog */}
      <form 
        onSubmit={handleSubmit}
        className="bg-card-bg border border-card-border rounded-2xl shadow-xl w-full max-w-lg relative z-10 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-card-border bg-background/50">
          <h2 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            <span>Outbox Mail Composer</span>
          </h2>
          <button 
            type="button" 
            onClick={onClose}
            className="text-text-muted hover:text-text-primary rounded p-1 hover:bg-card-border/30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form elements */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Metadata alert */}
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-[10px] text-text-secondary leading-normal flex gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span>
              Connected account: <strong>{connectedEmail ?? 'No email connected'}</strong> — All emails logged here sync with the lead sequence automatically.
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Recipient</label>
            <input 
              type="text" 
              value={`${lead.firstName} ${lead.lastName} <${lead.email}>`}
              disabled
              className="w-full bg-card-border/20 border border-transparent rounded-lg px-2.5 py-1.5 text-text-muted cursor-not-allowed font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Subject Line</label>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-medium"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Body Draft</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-background border border-card-border rounded-xl p-3 text-text-primary focus:outline-none focus:border-brand-red h-48 placeholder-text-muted resize-none leading-relaxed font-mono text-xs"
              required
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-card-border bg-background/30 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Email</span>
          </button>
        </div>

      </form>
    </div>
  );
}
