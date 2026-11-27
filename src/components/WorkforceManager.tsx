'use client';

import { useState } from 'react';
import { AppShell } from './AppShell';
import { formatCompactInr, formatInr } from '@/lib/format';
import type { OwnerWorkloadRow, PipelineOpportunityRow } from '@/lib/types';

interface WorkforceManagerProps {
  initialOwners: OwnerWorkloadRow[];
  initialOpenOpps: PipelineOpportunityRow[];
  mode: 'supabase' | 'local';
}

export function WorkforceManager({
  initialOwners,
  initialOpenOpps,
  mode,
}: WorkforceManagerProps) {
  const [owners, setOwners] = useState<OwnerWorkloadRow[]>(initialOwners);
  const [openOpps, setOpenOpps] = useState<PipelineOpportunityRow[]>(initialOpenOpps);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownerNames = owners.map((o) => o.owner_name);
  const kabir = owners.find((o) => o.owner_id === 'T02');
  const totalInteractions = owners.reduce((s, o) => s + o.interactions_count, 0);

  async function handleReassign(opportunityId: string, newOwnerName: string) {
    setReassigning(opportunityId);
    setError(null);
    setToast(null);
    try {
      const res = await fetch('/api/workforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opportunityId,
          new_owner_name: newOwnerName,
          idempotency_key: `wf_${opportunityId}_${crypto.randomUUID().slice(0, 8)}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const wfRes = await fetch('/api/workforce', { cache: 'no-store' });
      const wfData = await wfRes.json();
      if (wfRes.ok) {
        setOwners(wfData.owners ?? []);
        setOpenOpps(wfData.open_opportunities ?? []);
      }
      setToast(`Reassigned ${opportunityId} to ${newOwnerName} (audit trail appended).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reassignment failed');
    } finally {
      setReassigning(null);
    }
  }

  return (
    <AppShell mode={mode}>
      <div className="space-y-6">
        {/* Header */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-lg font-semibold text-slate-100">
            Workforce · Team Capacity &amp; Pipeline Reallocation
          </h1>
          <p className="text-xs text-slate-400">
            Balances outreach effort against closing load across CampusFest&rsquo;s 4 team owners (
            <span className="font-mono">v_owner_workload</span>).
          </p>
        </section>

        {/* Misallocation Banner */}
        {kabir && totalInteractions > 0 && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-100">
            <span className="font-semibold text-amber-300">Workforce Imbalance Detected:</span>{' '}
            {kabir.owner_name} ({kabir.owner_id}) holds{' '}
            <span className="font-mono font-semibold">
              {kabir.interactions_count}/{totalInteractions} (
              {((kabir.interactions_count / totalInteractions) * 100).toFixed(1)}%)
            </span>{' '}
            interactions ({kabir.email_interactions_count} cold emails, ₹0 closed) and{' '}
            <span className="font-mono font-semibold">{kabir.brands_owned}</span> brands, while{' '}
            <span className="font-mono font-semibold">{openOpps.length}</span> active open deals sit
            across Riya Kapoor, Nisha Rao, and Meera Iyer.
          </div>
        )}

        {toast && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-emerald-300 hover:text-white ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Owner Capacity Matrix */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-semibold text-slate-100 mb-3">
            Owner Capacity &amp; Conversion Matrix
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 pr-4">Team Member</th>
                  <th className="py-2.5 px-3 text-right">Brands</th>
                  <th className="py-2.5 px-3 text-right">Interactions</th>
                  <th className="py-2.5 px-3 text-right">Email Touches</th>
                  <th className="py-2.5 px-3 text-right">Open Deals</th>
                  <th className="py-2.5 px-3 text-right">Open Pipeline</th>
                  <th className="py-2.5 px-3 text-right">Confirmed</th>
                  <th className="py-2.5 px-3 text-right">Confirmed ₹</th>
                  <th className="py-2.5 pl-3 text-right">Open Tasks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {owners.map((o) => (
                  <tr key={o.owner_id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 pr-4 font-medium text-slate-100">
                      {o.owner_name}{' '}
                      <span className="ml-1 font-mono text-[10px] text-slate-500">
                        {o.owner_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {o.brands_owned}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {o.interactions_count}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-300">
                      {o.email_interactions_count}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-300">
                      {o.open_opps_count}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-300">
                      {formatCompactInr(o.open_pipeline_inr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-100">
                      {o.confirmed_deals_count}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-300">
                      {formatInr(o.confirmed_value_inr)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums">
                      {o.open_tasks_count}
                      {o.overdue_tasks_count > 0 && (
                        <span className="ml-1 text-rose-400">({o.overdue_tasks_count} late)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Rebalance Open Deals */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Rebalance Active Open Pipeline ({openOpps.length} Deals)
            </h2>
            <p className="text-xs text-slate-400">
              Reassigning an owner appends a new <span className="font-mono">opportunity_history</span>{' '}
              row and updates the capacity matrix live.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-3">Brand / Deal</th>
                  <th className="py-2 px-2">Stage</th>
                  <th className="py-2 px-2 text-right">Proposed ₹</th>
                  <th className="py-2 px-2">Originating Campaign</th>
                  <th className="py-2 pl-2 text-right">Assigned Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {openOpps.map((o) => (
                  <tr key={o.opportunity_id} className="hover:bg-slate-800/30">
                    <td className="py-2 pr-3 font-medium text-slate-100">
                      {o.brand_name}{' '}
                      <span className="font-mono text-[10px] text-slate-500">
                        {o.opportunity_id}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                        {o.stage}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-sky-300">
                      {formatInr(o.proposed_value_inr)}
                    </td>
                    <td className="py-2 px-2 text-slate-400">{o.originating_campaign_name}</td>
                    <td className="py-2 pl-2 text-right">
                      <select
                        aria-label={`Owner for ${o.brand_name}`}
                        value={o.owner_name}
                        disabled={reassigning === o.opportunity_id}
                        onChange={(e) => void handleReassign(o.opportunity_id, e.target.value)}
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
                      >
                        {ownerNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
