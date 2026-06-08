'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Flame, Mail, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password.');
    } else {
      router.push('/');
      router.refresh();
    }
  };

  const handleDemoAccess = async () => {
    setLoading(true);
    setError('');
    await signIn('credentials', {
      email: 'son@telestar.co',
      password: 'telestar2026',
      redirect: false,
    });
    setLoading(false);
    router.push('/');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-red/10 border border-brand-red/20 mb-4">
            <Flame className="w-7 h-7 text-brand-red" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
            Telestar CRM
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            SDR Operations Platform
          </p>
        </div>

        {/* Login card */}
        <div className="bg-card-bg border border-card-border rounded-2xl p-6 shadow-lg">
          <h2 className="font-display font-bold text-sm text-text-primary mb-5">
            Sign in to your workspace
          </h2>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-brand-red/5 border border-brand-red/20 rounded-xl text-xs text-brand-red">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@telestar.co"
                  required
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-card-border rounded-xl text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-card-border rounded-xl text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-brand-red hover:bg-brand-red-hover disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] text-text-muted mt-5 leading-relaxed">
            No self-registration. Contact your Director to get access.
          </p>
        </div>

        {/* Quick Demo Access */}
        <div className="mt-4 p-4 bg-card-bg border border-card-border/60 rounded-xl space-y-3">
          <p className="text-[10px] text-text-muted text-center font-mono uppercase tracking-widest">
            Demo Access
          </p>
          <button
            type="button"
            onClick={handleDemoAccess}
            disabled={loading}
            className="w-full py-2 border border-brand-orange/40 bg-brand-orange/5 hover:bg-brand-orange/10 text-brand-orange text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>⚡</span>
            Continue as Director (Son Nguyen)
          </button>
          <p className="text-[10px] text-text-muted text-center leading-relaxed">
            <span className="font-mono">son@telestar.co</span> · <span className="font-mono">telestar2026</span>
          </p>
        </div>
      </div>
    </div>
  );
}
