'use client';

import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, Volume2 } from 'lucide-react';
interface Task { id: string; type: string; title: string; description: string; dueDate: string; status: string; leadId: string; }
interface Lead { id: string; firstName: string; lastName: string; company: string; phone?: string; }

interface CallDialerModalProps {
  task: Task;
  lead: Lead;
  onClose: () => void;
  onHangUp: (notes: string, outcome: string) => void;
}

export default function CallDialerModal({ task: _task, lead, onClose, onHangUp }: CallDialerModalProps) {
  const [callState, setCallState] = useState<'dialing' | 'connected' | 'completed'>('dialing');
  const [seconds, setSeconds] = useState(0);
  const [callOutcome, setCallOutcome] = useState('Connected - Pitching');
  const [callNote, setCallNote] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  // Simulate Dialing -> Connected transition
  useEffect(() => {
    const dialTimer = setTimeout(() => {
      setCallState('connected');
    }, 1500);

    return () => clearTimeout(dialTimer);
  }, []);

  // Connected Timer ticking up
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callState === 'connected') {
      interval = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleHangUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const duration = formatTime(seconds);
    const compiledNotes = `Phone Call (${duration}).\nOutcome: ${callOutcome}\nNotes: ${callNote}`;
    onHangUp(compiledNotes, callOutcome);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialer Panel container */}
      <div className="bg-card-bg border border-card-border rounded-3xl shadow-xl w-full max-w-sm relative z-10 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
        
        {/* Call Status Section */}
        <div className="bg-gradient-to-b from-brand-dark/40 to-background p-6 flex flex-col items-center justify-center text-center border-b border-card-border/30">
          
          {/* Avatar / Icon dialing animation */}
          <div className="relative mb-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white ${
              callState === 'dialing' 
                ? 'bg-brand-orange animate-pulse shadow-[0_0_15px_rgba(232,97,26,0.4)]'
                : 'bg-green-600 shadow-[0_0_15px_rgba(34,197,94,0.4)]'
            }`}>
              <Phone className="w-6 h-6 animate-bounce" />
            </div>
            {callState === 'dialing' && (
              <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-brand-orange animate-ping opacity-60" />
            )}
          </div>

          <h2 className="font-display font-extrabold text-base text-text-primary">
            {lead.firstName} {lead.lastName}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">{lead.company}</p>
          <span className="text-[10px] text-brand-orange font-mono font-bold uppercase tracking-widest mt-1">
            {lead.phone || 'Unknown dial'}
          </span>

          <div className="mt-3 text-xs font-mono font-bold flex items-center gap-1.5">
            {callState === 'dialing' ? (
              <span className="text-text-muted animate-pulse">Dialing Campaign Server...</span>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                <span className="text-green-500">Connected: {formatTime(seconds)}</span>
              </>
            )}
          </div>
        </div>

        {/* Call Controls Pad */}
        <div className="px-6 py-4 flex justify-center gap-6 border-b border-card-border/30 bg-background/20">
          <button 
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
              isMuted 
                ? 'bg-brand-red/10 border-brand-red/30 text-brand-red font-semibold' 
                : 'border-card-border text-text-secondary hover:bg-card-border/40'
            }`}
            title="Mute Mic"
          >
            <Mic className="w-4.5 h-4.5" />
          </button>
          
          <button 
            type="button"
            className="w-10 h-10 rounded-full flex items-center justify-center border border-card-border text-text-secondary hover:bg-card-border/40 transition-all"
            title="Keypad"
          >
            <span className="text-xs font-bold font-mono">123</span>
          </button>

          <button 
            type="button"
            onClick={() => setIsSpeaker(!isSpeaker)}
            className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
              isSpeaker 
                ? 'bg-brand-gold/10 border-brand-gold/30 text-brand-gold font-semibold' 
                : 'border-card-border text-text-secondary hover:bg-card-border/40'
            }`}
            title="Speaker"
          >
            <Volume2 className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Outcome Logging Form */}
        <form onSubmit={handleHangUpSubmit} className="p-5 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Select Outcome</label>
            <select
              value={callOutcome}
              onChange={(e) => setCallOutcome(e.target.value)}
              className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-semibold cursor-pointer"
            >
              <option value="Connected - Pitching">Connected - Pitching</option>
              <option value="Connected - Meeting Booked">Connected - Meeting Booked</option>
              <option value="Busy/No Answer">Busy/No Answer</option>
              <option value="Gatekeeper Rejection">Gatekeeper Rejection</option>
              <option value="Left Voicemail">Left Voicemail</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Call Notes</label>
            <textarea
              placeholder="Log conversion feedback, timing preference, or gating items..."
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              className="w-full bg-background border border-card-border rounded-xl p-2.5 text-text-primary focus:outline-none focus:border-brand-red h-20 placeholder-text-muted resize-none leading-relaxed"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-xl shadow-lg transition-colors duration-150 flex items-center justify-center gap-1.5 active:scale-95 shadow-brand-red/10"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Hang Up &amp; Save Outcome</span>
          </button>
        </form>

      </div>
    </div>
  );
}
