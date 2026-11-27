'use client';

import { useState } from 'react';
import { AppShell } from './AppShell';
import { formatCompactInr, formatInr } from '@/lib/format';
import type { EventMilestoneRow, EventPackageRow, PipelineOpportunityRow } from '@/lib/types';

interface EventsManagerProps {
  initialPackages: EventPackageRow[];
  initialMilestones: EventMilestoneRow[];
  opportunities: PipelineOpportunityRow[];
  mode: 'supabase' | 'local';
}

const PKG_BADGE: Record<EventPackageRow['status'], string> = {
  available: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  reserved: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  sold: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  delivered: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
};

const MS_BADGE: Record<EventMilestoneRow['status'], string> = {
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  pending: 'bg-slate-800 text-slate-300 border-slate-700',
};

export function EventsManager({
  initialPackages,
  initialMilestones,
  opportunities,
  mode,
}: EventsManagerProps) {
  const [packages, setPackages] = useState<EventPackageRow[]>(initialPackages);
  const [milestones, setMilestones] = useState<EventMilestoneRow[]>(initialMilestones);
  const [reservingPkg, setReservingPkg] = useState<EventPackageRow | null>(null);
  const [selectedOppId, setSelectedOppId] = useState<string>(
    opportunities.find((o) =>
      ['prospecting', 'contacted', 'proposal_sent', 'negotiating'].includes(o.stage)
    )?.opportunity_id ??
      opportunities[0]?.opportunity_id ??
      ''
  );
  const [pkgStatus, setPkgStatus] = useState<'reserved' | 'sold'>('reserved');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const oppMap = new Map(opportunities.map((o) => [o.opportunity_id, o]));

  async function refreshEvents() {
    const res = await fetch('/api/events', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) {
      setPackages(data.packages ?? []);
      setMilestones(data.milestones ?? []);
    }
  }

  async function handleMilestoneChange(
    milestoneId: string,
    status: EventMilestoneRow['status']
  ) {
    setError(null);
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_milestone',
        milestone_id: milestoneId,
        status,
      }),
    });
    if (res.ok) {
      await refreshEvents();
    } else {
      const data = await res.json();
      setError(data?.error || 'Failed to update milestone');
    }
  }

  async function handleReserveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reservingPkg || !selectedOppId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reserve_package',
          package_id: reservingPkg.package_id,
          opportunity_id: selectedOppId,
          status: pkgStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await refreshEvents();
      setToast(
        `Attached "${reservingPkg.package_name}" to ${oppMap.get(selectedOppId)?.brand_name ?? selectedOppId} and spawned ${data.tasksCreated?.length ?? 4} pre-event deliverable tasks in /tasks.`
      );
      setReservingPkg(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reserve package');
    } finally {
      setSaving(false);
    }
  }

  const completedCount = milestones.filter((m) => m.status === 'completed').length;

  return (
    <AppShell mode={mode}>
      <div className="space-y-6">
        {/* Header */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              Events · IIT-Inspired Sponsorship Packages &amp; Readiness
            </h1>
            <p className="text-xs text-slate-400">
              CampusFest 2025 (12–13 Apr 2025) · Experiential packages adapted from Mood Indigo,
              Rendezvous, Antaragni, Saarang &amp; Spring Fest.
            </p>
          </div>
          <div className="text-xs font-mono rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-emerald-300">
            Readiness: {completedCount}/{milestones.length} milestones complete
          </div>
        </section>

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

        {/* Pre-Event Milestone Timeline */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-semibold text-slate-100 mb-3">
            Pre-Event Readiness Timeline (Anchored to 12–13 Apr 2025)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {milestones.map((m) => (
              <div
                key={m.milestone_id}
                className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 flex flex-col justify-between gap-2.5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-sky-300">
                      {m.code} · {m.due_date}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${MS_BADGE[m.status]}`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-slate-100">{m.title}</div>
                  <p className="mt-1 text-[11px] text-slate-400">{m.notes}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500">
                    {m.category}
                  </span>
                  <select
                    aria-label={`Status for ${m.title}`}
                    value={m.status}
                    onChange={(e) =>
                      void handleMilestoneChange(
                        m.milestone_id,
                        e.target.value as EventMilestoneRow['status']
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                  >
                    <option value="pending">pending</option>
                    <option value="in_progress">in_progress</option>
                    <option value="completed">completed</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* IIT-Inspired Sponsorship Packages */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Experiential Sponsorship Inventory (IIT Fest Playbook)
            </h2>
            <p className="text-xs text-slate-400">
              Attach any package to a brand opportunity to reserve the property and auto-generate
              pre-event collection &amp; ops tasks.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {packages.map((p) => {
              const linkedOpp = p.opportunity_id ? oppMap.get(p.opportunity_id) : null;
              return (
                <div
                  key={p.package_id}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          {p.package_name}
                        </div>
                        <div className="text-[11px] text-sky-300 mt-0.5">{p.iit_inspiration}</div>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${PKG_BADGE[p.status]}`}
                      >
                        {p.status}
                      </span>
                    </div>

                    <p className="mt-2.5 text-xs text-slate-300">{p.deliverables_summary}</p>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono">
                      <span className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-emerald-300">
                        List: {formatInr(p.list_price_inr)} ({formatCompactInr(p.list_price_inr)})
                      </span>
                      <span className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-slate-300">
                        Vertical: {p.target_industry}
                      </span>
                      <span className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-slate-400">
                        Tier: {p.tier} · {p.slots_total} slots
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <div className="text-slate-400">
                      {linkedOpp ? (
                        <span>
                          Linked:{' '}
                          <span className="text-slate-100 font-medium">{linkedOpp.brand_name}</span>{' '}
                          ({linkedOpp.opportunity_id} · {linkedOpp.stage})
                        </span>
                      ) : (
                        <span className="text-amber-300">Unassigned — open inventory</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setReservingPkg(p)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-medium text-slate-100 hover:border-emerald-500/50 hover:text-emerald-300 whitespace-nowrap"
                    >
                      Attach &amp; Spawn Tasks
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Attach modal */}
        {reservingPkg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  Attach {reservingPkg.package_name}
                </h2>
                <button
                  type="button"
                  onClick={() => setReservingPkg(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-4">
                Links this sponsorship property to an opportunity and auto-generates 4 pre-event
                tasks (50% advance, brand assets, 100% settlement, on-ground setup).
              </p>

              <form onSubmit={handleReserveSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1">Opportunity</label>
                  <select
                    value={selectedOppId}
                    onChange={(e) => setSelectedOppId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  >
                    {opportunities.map((o) => (
                      <option key={o.opportunity_id} value={o.opportunity_id}>
                        {o.brand_name} ({o.opportunity_id} · {o.stage} ·{' '}
                        {formatCompactInr(o.proposed_value_inr)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Package Status</label>
                  <select
                    value={pkgStatus}
                    onChange={(e) => setPkgStatus(e.target.value as 'reserved' | 'sold')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  >
                    <option value="reserved">reserved</option>
                    <option value="sold">sold</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReservingPkg(null)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {saving ? 'Attaching...' : 'Confirm & Spawn Checklist'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
