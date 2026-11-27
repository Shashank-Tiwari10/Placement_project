'use client';

import { useMemo, useState } from 'react';
import { AppShell } from './AppShell';
import { formatCompactInr, formatInr, formatIstDate } from '@/lib/format';
import type { CashMetrics, FunnelMetrics, OpportunityStage, PipelineOpportunityRow } from '@/lib/types';

interface HistoryEntry {
  history_id: string;
  stage: string;
  proposed_value_inr: number;
  confirmed_value_inr: number;
  collected_value_inr: number;
  owner_name: string;
  effective_at: string;
}

interface PipelineManagerProps {
  initialItems: PipelineOpportunityRow[];
  initialCash: CashMetrics;
  initialFunnel: FunnelMetrics;
  mode: 'supabase' | 'local';
}

const STAGES: Array<{ value: 'all' | OpportunityStage; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'partner_confirmed', label: 'Partner Confirmed' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'lost', label: 'Lost' },
];

const STAGE_BADGE: Record<OpportunityStage, string> = {
  partner_confirmed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  negotiating: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  proposal_sent: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  contacted: 'bg-slate-700/60 text-slate-200 border-slate-600',
  prospecting: 'bg-slate-800 text-slate-300 border-slate-700',
  withdrawn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  lost: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export function PipelineManager({
  initialItems,
  initialCash,
  initialFunnel,
  mode,
}: PipelineManagerProps) {
  const [items, setItems] = useState<PipelineOpportunityRow[]>(initialItems);
  const [cash, setCash] = useState<CashMetrics>(initialCash);
  const [funnel, setFunnel] = useState<FunnelMetrics>(initialFunnel);
  const [stageFilter, setStageFilter] = useState<'all' | OpportunityStage>('all');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<PipelineOpportunityRow | null>(null);
  const [formStage, setFormStage] = useState<OpportunityStage>('negotiating');
  const [formProposed, setFormProposed] = useState('0');
  const [formConfirmed, setFormConfirmed] = useState('0');
  const [formCollected, setFormCollected] = useState('0');
  const [formOwner, setFormOwner] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (stageFilter !== 'all' && r.stage !== stageFilter) return false;
      if (q) {
        const hay = `${r.brand_name} ${r.opportunity_name} ${r.originating_campaign_name} ${r.owner_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, stageFilter, search]);

  function openEdit(row: PipelineOpportunityRow) {
    setEditing(row);
    setFormStage(row.stage);
    setFormProposed(String(row.proposed_value_inr));
    setFormConfirmed(
      String(row.confirmed_value_inr > 0 ? row.confirmed_value_inr : row.proposed_value_inr)
    );
    setFormCollected(String(row.collected_value_inr));
    setFormOwner(row.owner_name);
    setSaveError(null);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setSaveError(null);

    try {
      const idempotencyKey = `${editing.opportunity_id}_${Date.now()}`;
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: editing.opportunity_id,
          stage: formStage,
          proposed_value_inr: Number(formProposed || 0),
          confirmed_value_inr:
            formStage === 'partner_confirmed' ? Number(formConfirmed || 0) : 0,
          collected_value_inr:
            formStage === 'partner_confirmed' ? Number(formCollected || 0) : 0,
          owner_name: formOwner,
          idempotency_key: idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const listRes = await fetch('/api/pipeline', { cache: 'no-store' });
      const listData = await listRes.json();
      if (listRes.ok) {
        setItems(listData.items);
        setCash(listData.cash);
        setFunnel(listData.funnel);
      }

      setToast(
        `Appended immutable history for ${editing.brand_name} → ${formStage}. Dashboard KPIs recomputed.`
      );
      setEditing(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save update');
    } finally {
      setSaving(false);
    }
  }

  async function viewHistory(opportunityId: string) {
    setHistoryFor(opportunityId);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/pipeline/${encodeURIComponent(opportunityId)}/history`, {
        cache: 'no-store',
      });
      const data = await res.json();
      setHistoryRows(data.history ?? []);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <AppShell mode={mode}>
      <div className="space-y-5">
        {/* Header + Live recompute bar */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">
                Manage · Partner Pipeline (Append-Only History)
              </h1>
              <p className="text-xs text-slate-400">
                Every edit appends a new row to <span className="font-mono">opportunity_history</span>{' '}
                and recomputes <span className="font-mono">v_funnel</span> &amp;{' '}
                <span className="font-mono">v_cash</span> live.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
                <span className="text-slate-400">Confirmed:</span>{' '}
                <span className="font-mono font-semibold text-emerald-300">
                  {cash.confirmed_count} · {formatCompactInr(cash.confirmed_value_inr)}
                </span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5">
                <span className="text-slate-400">Collected:</span>{' '}
                <span className="font-mono font-semibold text-amber-300">
                  {formatCompactInr(cash.collected_value_inr)}
                </span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5">
                <span className="text-slate-400">Open:</span>{' '}
                <span className="font-mono font-semibold text-sky-300">
                  {cash.open_count} · {formatCompactInr(cash.open_pipeline_inr)}
                </span>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5">
                <span className="text-slate-400">Confirmed Brands:</span>{' '}
                <span className="font-mono font-semibold text-slate-100">
                  {funnel.confirmed_brands}
                </span>
              </div>
            </div>
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

        {/* Filters */}
        <section className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStageFilter(s.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
                  stageFilter === s.value
                    ? 'bg-slate-800 text-emerald-300 border-slate-600'
                    : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search brand, campaign, owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-full md:w-64"
          />
        </section>

        {/* Table */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No opportunities match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-4">Brand / Opportunity</th>
                    <th className="py-2.5 px-3">Origin Campaign</th>
                    <th className="py-2.5 px-3">Stage</th>
                    <th className="py-2.5 px-3 text-right">Proposed ₹</th>
                    <th className="py-2.5 px-3 text-right">Confirmed ₹</th>
                    <th className="py-2.5 px-3 text-right">Collected ₹</th>
                    <th className="py-2.5 px-3">Owner</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filtered.map((row) => (
                    <tr key={row.opportunity_id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-100">{row.brand_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {row.opportunity_id} · {row.support_type} · {row.primary_contact_name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {row.originating_campaign_name}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STAGE_BADGE[row.stage]}`}
                        >
                          {row.stage}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                        {formatInr(row.proposed_value_inr)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-300">
                        {formatInr(row.confirmed_value_inr)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-300">
                        {formatInr(row.collected_value_inr)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{row.owner_name}</td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void viewHistory(row.opportunity_id)}
                          className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
                        >
                          History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Edit Modal */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  Update {editing.brand_name} ({editing.opportunity_id})
                </h2>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-4">
                Saves by appending a new timestamped version to{' '}
                <span className="font-mono">opportunity_history</span>.
              </p>

              <form onSubmit={submitEdit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1">Stage</label>
                  <select
                    value={formStage}
                    onChange={(e) => setFormStage(e.target.value as OpportunityStage)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  >
                    {STAGES.filter((s) => s.value !== 'all').map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">Proposed (INR)</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={formProposed}
                      onChange={(e) => setFormProposed(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Owner</label>
                    <input
                      type="text"
                      value={formOwner}
                      onChange={(e) => setFormOwner(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                  </div>
                </div>

                {formStage === 'partner_confirmed' && (
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div>
                      <label className="block text-emerald-200 mb-1">Confirmed (INR)</label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={formConfirmed}
                        onChange={(e) => setFormConfirmed(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-amber-200 mb-1">Collected Pre-Event (INR)</label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={formCollected}
                        onChange={(e) => setFormCollected(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}

                {saveError && (
                  <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-rose-200">
                    {saveError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {saving ? 'Appending...' : 'Append Version'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Audit Trail Modal */}
        {historyFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  Audit Trail · {historyFor}
                </h2>
                <button
                  type="button"
                  onClick={() => setHistoryFor(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              {historyLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading history...</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {historyRows.map((h) => (
                    <div
                      key={h.history_id}
                      className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-slate-200">
                          {h.stage}{' '}
                          <span className="font-mono text-[10px] text-slate-500">
                            ({h.history_id})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Owner: {h.owner_name} · {formatIstDate(h.effective_at)}
                        </div>
                      </div>
                      <div className="text-right font-mono text-[11px]">
                        <div className="text-slate-300">Prop: {formatInr(h.proposed_value_inr)}</div>
                        <div className="text-emerald-300">
                          Conf: {formatInr(h.confirmed_value_inr)}
                        </div>
                        {h.collected_value_inr > 0 && (
                          <div className="text-amber-300">
                            Coll: {formatInr(h.collected_value_inr)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
