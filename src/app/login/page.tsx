'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TeamMemberRow } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [memberId, setMemberId] = useState('T_HEAD');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.members)) setMembers(d.members);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Login failed');
      const role = data.principal?.role;
      router.push(role === 'coordinator' ? '/tasks' : '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl space-y-5">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-400">
            CampusFest 2025 · 3-Tier Access
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-100">
            Sign in to Growth Center
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Access is scoped by hierarchy: Heads, Managers, and Coordinators.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 mb-1">Team Member</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {members.map((m) => (
                <option key={m.member_id} value={m.member_id}>
                  {m.full_name} — {m.role.toUpperCase()} ({m.member_id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">PIN</label>
            <input
              type="password"
              required
              placeholder="Demo PINs: 1111 (Head), 2222/3333 (Mgr), 4444/5555 (Coord)"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
