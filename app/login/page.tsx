'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--ink)' }}>
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--gold)' }}>
              <span className="text-black font-bold text-sm">E</span>
            </div>
            <span className="text-xl font-semibold text-white">Emerald AI</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>AQ Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <h1 className="text-lg font-semibold text-white mb-6">Sign in to your account</h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9ca3af' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-gray-600 outline-none focus:ring-2 transition"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  '--tw-ring-color': 'var(--gold)',
                } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9ca3af' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-gray-600 outline-none focus:ring-2 transition"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  '--tw-ring-color': 'var(--gold)',
                } as React.CSSProperties}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-black transition disabled:opacity-60"
              style={{ background: loading ? '#9ca3af' : 'var(--gold)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted)' }}>
          Contact your administrator to get access
        </p>
      </div>
    </div>
  );
}
