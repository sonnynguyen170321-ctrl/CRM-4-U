'use client';

import React, { useEffect, useState } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Info, 
  AlertTriangle, 
  X 
} from 'lucide-react';
import { ToastType } from '@/context/ToastContext';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onClose();
      }
    }, 30);

    return () => clearInterval(interval);
  }, [duration, onClose]);

  const typeConfig = {
    success: {
      bg: 'bg-card-bg/95 border-emerald-500/25',
      icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
      barColor: 'bg-emerald-500',
    },
    error: {
      bg: 'bg-card-bg/95 border-brand-red/25',
      icon: <XCircle className="w-4 h-4 text-brand-red" />,
      barColor: 'bg-brand-red',
    },
    info: {
      bg: 'bg-card-bg/95 border-blue-500/25',
      icon: <Info className="w-4 h-4 text-blue-500" />,
      barColor: 'bg-blue-500',
    },
    warning: {
      bg: 'bg-card-bg/95 border-brand-gold/25',
      icon: <AlertTriangle className="w-4 h-4 text-brand-gold" />,
      barColor: 'bg-brand-gold',
    }
  };

  const config = typeConfig[type];

  return (
    <div 
      className={`pointer-events-auto flex flex-col w-full max-w-sm rounded-xl border shadow-lg overflow-hidden animate-in slide-in-from-bottom duration-200 relative ${config.bg}`}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="flex-shrink-0">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs font-semibold text-text-primary leading-normal">
            {message}
          </p>
        </div>
        <button 
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors p-0.5 rounded-md hover:bg-card-border/30 flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      
      {/* Auto dismiss countdown progress bar */}
      <div className="w-full bg-card-border h-0.5 mt-auto">
        <div 
          className={`h-full rounded-r ${config.barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
