import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { MeasureDashboard } from '@/components/MeasureDashboard';
import { getSessionPrincipal } from '@/lib/auth';
import { getMeasureSnapshot } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const principal = await getSessionPrincipal();
  if (principal.role === 'coordinator') {
    return (
      <AppShell mode="local">
        <div className="rounded-xl border border-amber-500/30 bg-slate-900/80 p-6 space-y-3">
          <div className="text-xs font-mono uppercase text-amber-300">
            Coordinator Access Scope ({principal.full_name})
          </div>
          <h1 className="text-lg font-semibold text-slate-100">
            Org-wide financial metrics are restricted to Managers &amp; Heads
          </h1>
          <p className="text-xs text-slate-400">
            Use your assigned execution surfaces below to manage tasks, event deliverables, and
            your target call list.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href="/tasks"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              My Tasks
            </Link>
            <Link
              href="/targets"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
            >
              Target Call List
            </Link>
            <Link
              href="/events"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
            >
              Event Deliverables
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const initialData = await getMeasureSnapshot(null);
  return <MeasureDashboard initialData={initialData} />;
}
