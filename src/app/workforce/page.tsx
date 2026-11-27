import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { WorkforceManager } from '@/components/WorkforceManager';
import { getSessionPrincipal } from '@/lib/auth';
import { getWorkforceWorkload, listPipelineOpportunities } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function WorkforcePage() {
  const principal = await getSessionPrincipal();
  if (principal.role === 'coordinator') {
    return (
      <AppShell mode="local">
        <div className="rounded-xl border border-rose-500/30 bg-slate-900/80 p-6 space-y-3">
          <div className="text-xs font-mono uppercase text-rose-300">403 · Restricted</div>
          <h1 className="text-lg font-semibold text-slate-100">
            Workforce Capacity Matrix requires Manager or Head access
          </h1>
          <Link
            href="/tasks"
            className="inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Go to My Tasks
          </Link>
        </div>
      </AppShell>
    );
  }

  const [workload, pipeline] = await Promise.all([
    getWorkforceWorkload(),
    listPipelineOpportunities({ limit: 200 }),
  ]);

  const openOpps = pipeline.items.filter((o) =>
    ['prospecting', 'contacted', 'proposal_sent', 'negotiating'].includes(o.stage)
  );

  return (
    <WorkforceManager
      initialOwners={workload.owners}
      initialOpenOpps={openOpps}
      mode={workload.mode}
    />
  );
}
