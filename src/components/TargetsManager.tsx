'use client';

import { useMemo, useState } from 'react';
import { AppShell } from './AppShell';
import { formatCompactInr } from '@/lib/format';
import type {
  EventPackageRow,
  TargetCompanyRow,
  TargetOutreachStatus,
  TaskPriority,
  TeamMemberRow,
  TeamRole,
} from '@/lib/types';

interface TargetsManagerProps {
  initialItems: TargetCompanyRow[];
  packages: EventPackageRow[];
  members: TeamMemberRow[];
  role: TeamRole;
  mode: 'supabase' | 'local';
}

const STATUS_BADGE: Record<TargetOutreachStatus, string> = {
  shortlisted: 'bg-slate-800 text-slate-300 border-slate-700',
  assigned: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  contacted: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  promoted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  archived: 'bg-slate-900 text-slate-500 border-slate-800',
};

export function TargetsManager({
  initialItems,
  packages,
  members,
  role,
  mode,
}: TargetsManagerProps) {
  const [items, setItems] = useState<TargetCompanyRow[]>(initialItems);
  const [selectedPkg, setSelectedPkg] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('Education');
  const [city, setCity] = useState('Delhi NCR');
  const [packageId, setPackageId] = useState(packages[0]?.package_id ?? 'PKG_REVERSE_HACK');
  const [fitRationale, setFitRationale] = useState('');
  const [ticketInr, setTicketInr] = useState('150000');
  const [contactHint, setContactHint] = useState('Brand Marketing Lead');
  const [priority, setPriority] = useState<TaskPriority>('p1');
  const [assigneeId, setAssigneeId] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pkgMap = new Map(packages.map((p) => [p.package_id, p]));
  const memberMap = new Map(members.map((m) => [m.member_id, m]));
  const canManage = role === 'head' || role === 'manager';

  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (selectedPkg !== 'all' && t.package_id !== selectedPkg) return false;
      if (statusFilter !== 'all' && t.outreach_status !== statusFilter) return false;
      return true;
    });
  }, [items, selectedPkg, statusFilter]);

  async function refreshTargets() {
    const res = await fetch('/api/targets', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setItems(data.items ?? []);
  }

  async function handleStatusUpdate(targetId: string, outreachStatus: TargetOutreachStatus) {
    setBusy(targetId);
    setError(null);
    try {
      const res = await fetch('/api/targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId, outreach_status: outreachStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Update failed');
      await refreshTargets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  }

  async function handlePromote(targetId: string, name: string) {
    setBusy(targetId);
    setError(null);
    setToast(null);
    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote', target_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Promote failed');
      await refreshTargets();
      setToast(
        `Promoted "${name}" into active Pipeline (${data.opportunity_id}) without altering historical dataset baseline.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promote failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    setToast(null);
    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          industry,
          city,
          package_id: packageId,
          fit_rationale: fitRationale,
          estimated_ticket_inr: Number(ticketInr || 0),
          contact_role_hint: contactHint,
          priority,
          assigned_to_member_id: assigneeId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Create failed');
      await refreshTargets();
      setToast(`Added "${companyName}" to Target Companies.`);
      setCompanyName('');
      setFitRationale('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell mode={mode}>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-lg font-semibold text-slate-100">
            Targets · Prospective Companies per Event
          </h1>
          <p className="text-xs text-slate-400">
            External prospect directory separate from the 180 historical dataset brands. Filter by
            event package to see which companies to call for each CampusFest activation.
          </p>
        </section>

        {toast && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} className="ml-4 text-emerald-300">
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Per-Event Filter Tabs */}
        <section className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedPkg('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border ${
                selectedPkg === 'all'
                  ? 'bg-slate-800 text-emerald-300 border-slate-600'
                  : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              All Events ({items.length})
            </button>
            {packages.map((p) => {
              const count = items.filter((i) => i.package_id === p.package_id).length;
              return (
                <button
                  key={p.package_id}
                  type="button"
                  onClick={() => setSelectedPkg(p.package_id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium border ${
                    selectedPkg === p.package_id
                      ? 'bg-slate-800 text-emerald-300 border-slate-600'
                      : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {p.package_name} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Status:</span>
            {(['all', 'shortlisted', 'assigned', 'contacted', 'promoted'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2 py-0.5 border text-[11px] ${
                  statusFilter === s
                    ? 'bg-slate-800 text-slate-100 border-slate-600'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Target Company Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.length === 0 ? (
            <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
              No target companies match this event/status filter.
            </div>
          ) : (
            filtered.map((t) => {
              const pkg = pkgMap.get(t.package_id);
              const assignee = t.assigned_to_member_id
                ? memberMap.get(t.assigned_to_member_id)
                : null;
              return (
                <div
                  key={t.target_id}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">
                            {t.company_name}
                          </span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-amber-300">
                            {t.priority}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {t.industry} · {t.city} · Ask: {t.contact_role_hint}
                        </div>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[t.outreach_status]}`}
                      >
                        {t.outreach_status}
                      </span>
                    </div>

                    <div className="mt-2 rounded bg-slate-950/70 border border-slate-800/80 px-2.5 py-1.5 text-[11px] text-sky-300">
                      Event Fit: {pkg?.package_name ?? t.package_id} (Est.{' '}
                      {formatCompactInr(t.estimated_ticket_inr)})
                    </div>

                    <p className="mt-2 text-xs text-slate-300">{t.fit_rationale}</p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400">
                      Owner: {assignee ? `${assignee.full_name} (${assignee.role})` : 'Unassigned'}
                    </span>

                    <div className="flex items-center gap-2">
                      {t.outreach_status !== 'promoted' && (
                        <button
                          type="button"
                          disabled={busy === t.target_id}
                          onClick={() => void handleStatusUpdate(t.target_id, 'contacted')}
                          className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:border-amber-500/50"
                        >
                          Mark Contacted
                        </button>
                      )}
                      {canManage && t.outreach_status !== 'promoted' && (
                        <button
                          type="button"
                          disabled={busy === t.target_id}
                          onClick={() => void handlePromote(t.target_id, t.company_name)}
                          className="rounded bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          Promote to Pipeline
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Add Target Company Form (Managers & Heads) */}
        {canManage && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-sm font-semibold text-slate-100 mb-3">
              Add Prospective Target Company
            </h2>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zepto"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Target Event Package</label>
                <select
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                >
                  {packages.map((p) => (
                    <option key={p.package_id} value={p.package_id}>
                      {p.package_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Industry</label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                >
                  <option value="Education">Education</option>
                  <option value="Food and beverage">Food and beverage</option>
                  <option value="Mobility">Mobility</option>
                  <option value="Consumer products">Consumer products</option>
                  <option value="Personal care">Personal care</option>
                  <option value="Media">Media</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Est. Ticket (INR)</label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={ticketInr}
                    onChange={(e) => setTicketInr(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  >
                    <option value="p0">P0</option>
                    <option value="p1">P1</option>
                    <option value="p2">P2</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Assign To (Optional)</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.member_id} value={m.member_id}>
                      {m.full_name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-slate-300 mb-1">Contact Role Hint</label>
                <input
                  type="text"
                  value={contactHint}
                  onChange={(e) => setContactHint(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-slate-300 mb-1">Event Fit Rationale</label>
                <input
                  type="text"
                  required
                  placeholder="Why should we call this company for this event package?"
                  value={fitRationale}
                  onChange={(e) => setFitRationale(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={busy === 'create'}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy === 'create' ? 'Adding...' : 'Add Target Company'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </AppShell>
  );
}
