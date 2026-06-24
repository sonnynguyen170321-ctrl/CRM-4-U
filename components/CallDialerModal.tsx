'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, Volume2 } from 'lucide-react';

interface Task { id: string; type: string; title: string; description: string; dueDate: string; status: string; leadId: string; }
interface Lead { id: string; firstName: string; lastName: string; company: string; phone?: string; }

interface CallDialerModalProps {
  task?: Task | null;
  lead: Lead;
  onClose: () => void;
  onHangUp: (notes: string, outcome: string) => void;
}

// Helper to synthesize DTMF tones using Web Audio API
const playDtmfTone = (digit: string) => {
  if (typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  const dtmfFreqs: Record<string, [number, number]> = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  const freqs = dtmfFreqs[digit];
  if (!freqs) return;

  try {
    const ctx = new AudioContextClass();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.value = freqs[0];
    osc2.frequency.value = freqs[1];

    gain.gain.setValueAtTime(0.08, ctx.currentTime); // comfortable volume level
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12); // quick decay

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.12);
  } catch (err) {
    console.error('Error playing DTMF tone:', err);
  }
};

export default function CallDialerModal({ task: _task, lead, onClose, onHangUp }: CallDialerModalProps) {
  const [callState, setCallState] = useState<'dialing' | 'connected' | 'completed'>('dialing');
  const [seconds, setSeconds] = useState(0);
  const [callOutcome, setCallOutcome] = useState('Connected - Pitching');
  const [callNote, setCallNote] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);

  // Twilio Connection references
  const [device, setDevice] = useState<any>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);

  // Initialize Twilio Device and start Call
  useEffect(() => {
    let activeDevice: any = null;

    async function initTwilio() {
      try {
        const tokenRes = await fetch('/api/dialer/token');
        if (!tokenRes.ok) {
          throw new Error('Failed to retrieve voice access token');
        }
        const { token } = await tokenRes.json();
        if (!token) {
          throw new Error('No voice token returned from server');
        }

        // Dynamically load Twilio Voice SDK on client to avoid SSR issues
        const { Device } = await import('@twilio/voice-sdk');

        const newDevice = new Device(token, {
          logLevel: 'debug',
          codecPreferences: ['opus', 'pcmu'] as any,
        });

        await newDevice.register();
        activeDevice = newDevice;
        setDevice(newDevice);
        deviceRef.current = newDevice;

        const targetPhone = lead.phone ? lead.phone.trim() : '';
        if (!targetPhone) {
          console.warn('No target phone number provided');
          return;
        }

        // Connect the WebRTC call session
        const call = await newDevice.connect({
          params: { To: targetPhone }
        });

        setActiveCall(call);
        callRef.current = call;

        // Setup call event listeners
        call.on('accept', () => {
          setCallState('connected');
        });

        call.on('disconnect', () => {
          setCallState('completed');
        });

        call.on('reject', () => {
          setCallState('completed');
        });

        call.on('error', (err: any) => {
          console.error('Twilio Voice connection error:', err);
          setCallState('completed');
        });

      } catch (err) {
        console.error('Twilio initialization failed, falling back to simulated session:', err);
        // BPO Demo Graceful Fallback
        const timer = setTimeout(() => {
          setCallState('connected');
        }, 1500);
        return () => clearTimeout(timer);
      }
    }

    initTwilio();

    return () => {
      // Disconnect call and clean up device on component unmount
      try {
        if (callRef.current) {
          callRef.current.disconnect();
        }
        if (activeDevice) {
          if (typeof activeDevice.destroy === 'function') {
            activeDevice.destroy();
          }
        }
      } catch (e) {
        console.warn('Error during Twilio client cleanup:', e);
      }
    };
  }, [lead.phone]);

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

  const toggleMute = () => {
    if (callRef.current) {
      const newMuteState = !isMuted;
      callRef.current.mute(newMuteState);
      setIsMuted(newMuteState);
    } else {
      setIsMuted(!isMuted);
    }
  };

  const handleKeypadPress = (digit: string) => {
    playDtmfTone(digit);
    if (callRef.current) {
      callRef.current.sendDigits(digit);
    }
  };

  const handleHangUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (callRef.current) {
      callRef.current.disconnect();
    }
    const duration = formatTime(seconds);
    const compiledNotes = `Phone Call (${duration}).\nOutcome: ${callOutcome}\nNotes: ${callNote}`;
    onHangUp(compiledNotes, callOutcome);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialer Panel container */}
      <div role="dialog" aria-modal="true" aria-label="Call dialer" className="bg-card-bg border border-card-border rounded-3xl shadow-xl w-full max-w-sm relative z-10 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
        
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
            onClick={toggleMute}
            className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
              isMuted 
                ? 'bg-brand-red/10 border-brand-red/30 text-brand-red font-semibold animate-pulse' 
                : 'border-card-border text-text-secondary hover:bg-card-border/40'
            }`}
            title={isMuted ? "Unmute Mic" : "Mute Mic"}
          >
            <Mic className="w-4.5 h-4.5" />
          </button>
          
          <button 
            type="button"
            onClick={() => setShowKeypad(!showKeypad)}
            className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
              showKeypad 
                ? 'bg-brand-orange/15 border-brand-orange/40 text-brand-orange font-semibold' 
                : 'border-card-border text-text-secondary hover:bg-card-border/40'
            }`}
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

        {/* Dynamic DTMF Keypad Grid */}
        {showKeypad && (
          <div className="bg-background/40 border-b border-card-border/30 px-6 py-4 grid grid-cols-3 gap-2.5 justify-items-center animate-in slide-in-from-top-3 duration-200">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadPress(digit)}
                className="w-11 h-11 rounded-full flex flex-col items-center justify-center border border-card-border hover:border-brand-orange/50 hover:bg-card-border/25 active:scale-90 transition-all text-sm font-semibold font-mono text-text-primary"
              >
                {digit}
              </button>
            ))}
          </div>
        )}

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

