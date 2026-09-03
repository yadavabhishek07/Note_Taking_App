'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to login');

      router.push('/notes');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoFill = async () => {
    setEmail('demo@example.com');
    setPassword('demo123456');

    try {
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@example.com', password: 'demo123456' }),
      });
    } catch {
      //
    }
  };

  return (
    <div className="max-w-sm mx-auto py-12">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-white">Login</h1>
          <p className="text-xs text-zinc-400">Sign in to manage your notes.</p>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-800 text-red-300 px-3 py-2 rounded text-xs">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleDemoFill}
          className="w-full text-xs py-1.5 px-3 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          Use Demo Account
        </button>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-3 rounded bg-white hover:bg-zinc-200 text-zinc-900 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center text-xs text-zinc-500 pt-2 border-t border-zinc-800">
          No account?{' '}
          <Link href="/register" className="text-zinc-300 hover:underline">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
