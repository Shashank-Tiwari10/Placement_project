'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { CopilotDrawer } from './CopilotDrawer';
import type { SessionPrincipal, TeamMemberRow, TeamRole } from '@/lib/types';

interface AppShellProps {
  children: ReactNode;
  mode?: 'supabase' | 'local';
  copilotSlot?: ReactNode;
}

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  roles: TeamRole[];
}> = [
  { href: '/', label: 'Measure', roles: ['head', 'manager'] },
  { href: '/pipeline', label: 'Pipeline', roles: ['head', 'manager', 'coordinator'] },
  { href: '/targets', label: 'Targets', roles: ['head', 'manager', 'coordinator'] },
  { href: '/events', label: 'Events', roles: ['head', 'manager', 'coordinator'] },
  { href: '/workforce', label: 'Workforce', roles: ['head', 'manager'] },
  { href: '/campaigns', label: 'Campaigns', roles: ['head', 'manager'] },
  { href: '/tasks', label: 'Tasks', roles: ['head', 'manager', 'coordinator'] },
  { href: '/whatsapp', label: 'WhatsApp', roles: ['head', 'manager', 'coordinator'] },
];

const ROLE_BADGE: Record<TeamRole, string> = {
  head: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  manager: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  coordinator: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

export function AppShell({ children, mode = 'local', copilotSlot }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [principal, setPrincipal] = useState<SessionPrincipal | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [demoSwitcher, setDemoSwitcher] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.principal) setPrincipal(d.principal);
        if (Array.isArray(d.members)) setMembers(d.members);
        setDemoSwitcher(Boolean(d.demoSwitcherEnabled));
      })
      .catch(() => {});
  }, []);

  async function handleRoleSwitch(memberId: string) {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, demo_switch: true }),
    });
    const data = await res.json();
    if (res.ok && data.principal) {
      setPrincipal(data.principal);
      if (data.principal.role === 'coordinator' && ['/', '/workforce', '/campaigns'].includes(pathname)) {
        router.push('/tasks');
      } else {
        router.refresh();
      }
    }
  }

  const activeRole: TeamRole = principal?.role ?? 'head';
  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(activeRole));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href={activeRole === 'coordinator' ? '/tasks' : '/'} className="flex items-center gap-2.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-bold">
                CF
              </span>
              <div className="leading-tight hidden sm:block">
                <div className="text-sm font-semibold tracking-tight text-slate-100">
                  CampusFest 2025
                </div>
                <div className="text-[11px] text-slate-400">
                  Sponsorship Growth Center
                </div>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
              {visibleNav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? 'bg-slate-800 text-emerald-300 border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {principal && demoSwitcher && members.length > 0 ? (
              <select
                aria-label="Active Role Switcher"
                value={principal.member_id}
                onChange={(e) => void handleRoleSwitch(e.target.value)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium bg-slate-950 focus:outline-none ${ROLE_BADGE[activeRole]}`}
              >
                {members.map((m) => (
                  <option key={m.member_id} value={m.member_id} className="bg-slate-900 text-slate-100">
                    {m.full_name} ({m.role.toUpperCase()})
                  </option>
                ))}
              </select>
            ) : principal ? (
              <Link
                href="/login"
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${ROLE_BADGE[activeRole]}`}
              >
                {principal.full_name} ({activeRole.toUpperCase()})
              </Link>
            ) : null}

            <span
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                mode === 'supabase'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  mode === 'supabase' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {mode === 'supabase' ? 'Supabase' : 'Local'}
            </span>
          </div>
        </div>

        <nav className="lg:hidden border-t border-slate-800 px-4 py-2 flex items-center gap-1 overflow-x-auto" aria-label="Mobile">
          {visibleNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                  active
                    ? 'bg-slate-800 text-emerald-300 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 py-6 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <main className="min-w-0">{children}</main>
        <aside className="xl:sticky xl:top-20 xl:h-[calc(100vh-6.5rem)]">
          {copilotSlot ?? <CopilotDrawer />}
        </aside>
      </div>
    </div>
  );
}
