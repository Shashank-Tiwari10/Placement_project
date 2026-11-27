'use client';

import { useMemo, useState } from 'react';
import { AppShell } from './AppShell';
import type {
  PipelineOpportunityRow,
  TaskCategory,
  TaskPriority,
  TaskRow,
  TaskStatus,
} from '@/lib/types';

interface TasksManagerProps {
  initialTasks: TaskRow[];
  brands: Array<{ brand_id: string; brand_name: string }>;
  campaigns: Array<{ sponsor_campaign_id: string; campaign_name: string }>;
  opportunities: PipelineOpportunityRow[];
  mode: 'supabase' | 'local';
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  todo: 'bg-slate-800 text-slate-300 border-slate-700',
  in_progress: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  done: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  p0: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  p1: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  p2: 'bg-slate-800 text-slate-400 border-slate-700',
};

export function TasksManager({
  initialTasks,
  brands,
  campaigns,
  opportunities,
  mode,
}: TasksManagerProps) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ownerName, setOwnerName] = useState('Riya Kapoor');
  const [dueDate, setDueDate] = useState('2025-04-05');
  const [priority, setPriority] = useState<TaskPriority>('p1');
  const [category, setCategory] = useState<TaskCategory>('closing');
  const [brandId, setBrandId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [checklistOppId, setChecklistOppId] = useState(
    opportunities[0]?.opportunity_id ?? ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const brandMap = new Map(brands.map((b) => [b.brand_id, b.brand_name]));
  const campaignMap = new Map(campaigns.map((c) => [c.sponsor_campaign_id, c.campaign_name]));

  const filteredTasks = useMemo(() => {
    if (ownerFilter === 'all') return tasks;
    return tasks.filter((t) => t.owner_name === ownerFilter);
  }, [tasks, ownerFilter]);

  async function refreshTasks() {
    const res = await fetch('/api/tasks', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setTasks(data.items ?? []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          owner_name: ownerName,
          due_date: dueDate || null,
          priority,
          category,
          brand_id: brandId || null,
          sponsor_campaign_id: campaignId || null,
          created_by: 'user',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await refreshTasks();
      setTitle('');
      setDescription('');
      setBrandId('');
      setCampaignId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateChecklist() {
    if (!checklistOppId) return;
    setSubmitting(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_checklist',
          opportunity_id: checklistOppId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await refreshTasks();
      setToast(`Generated 4 pre-event execution tasks for ${checklistOppId}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate checklist');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, status: TaskStatus) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await refreshTasks();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) await refreshTasks();
  }

  return (
    <AppShell mode={mode}>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-lg font-semibold text-slate-100">
            Manage · Execution Tasks &amp; Pre-Event Checklists
          </h1>
          <p className="text-xs text-slate-400">
            Prioritized action queue (`P0`/`P1`/`P2`) across outreach, closing, cash collection,
            creative assets, and on-ground event ops.
          </p>
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

        {/* 1-Click Deal Checklist Generator */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold text-slate-100">
              1-Click Pre-Event Deal Checklist
            </h2>
            <p className="text-[11px] text-slate-400">
              Spawns 50% advance, logo/booth specs, 100% pre-event settlement, and on-ground check.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={checklistOppId}
              onChange={(e) => setChecklistOppId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 max-w-[260px]"
            >
              {opportunities.map((o) => (
                <option key={o.opportunity_id} value={o.opportunity_id}>
                  {o.brand_name} ({o.opportunity_id} · {o.stage})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={submitting || !checklistOppId}
              onClick={() => void handleGenerateChecklist()}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 whitespace-nowrap"
            >
              Generate Checklist
            </button>
          </div>
        </section>

        {/* Create task form */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-semibold text-slate-100 mb-3">Create Action Task</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-slate-300 mb-1">Task Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Close negotiating deals in Warm Partner Introductions"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 mb-1">Notes / Context</label>
              <input
                type="text"
                placeholder="Optional execution notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Owner</label>
              <select
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                <option value="Riya Kapoor">Riya Kapoor</option>
                <option value="Nisha Rao">Nisha Rao</option>
                <option value="Meera Iyer">Meera Iyer</option>
                <option value="Kabir Shah">Kabir Shah</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                <option value="p0">P0 (Critical Cash / Blocker)</option>
                <option value="p1">P1 (High)</option>
                <option value="p2">P2 (Normal)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                <option value="closing">closing</option>
                <option value="collection">collection</option>
                <option value="event_ops">event_ops</option>
                <option value="creative_assets">creative_assets</option>
                <option value="outreach">outreach</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Linked Campaign (Optional)</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                <option value="">None</option>
                {campaigns.map((c) => (
                  <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>
                    {c.campaign_name} ({c.sponsor_campaign_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Linked Brand (Optional)</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                <option value="">None</option>
                {brands.map((b) => (
                  <option key={b.brand_id} value={b.brand_id}>
                    {b.brand_name} ({b.brand_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between pt-1">
              <div className="text-rose-300">{error}</div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Task'}
              </button>
            </div>
          </form>
        </section>

        {/* Task list */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Action Queue ({filteredTasks.length})
            </h2>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="all">All Owners</option>
              <option value="Riya Kapoor">Riya Kapoor</option>
              <option value="Nisha Rao">Nisha Rao</option>
              <option value="Meera Iyer">Meera Iyer</option>
              <option value="Kabir Shah">Kabir Shah</option>
            </select>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
              No tasks in queue. Add one above, generate a deal checklist, or ask the Copilot.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTasks.map((t) => {
                const prio = (t.priority ?? 'p1') as TaskPriority;
                const cat = t.category ?? 'closing';
                return (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[t.status]}`}
                        >
                          {t.status}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${PRIORITY_BADGE[prio]}`}
                        >
                          {prio}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-sky-300">
                          {cat}
                        </span>
                        <span className="text-xs font-semibold text-slate-100">{t.title}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                          {t.created_by}
                        </span>
                      </div>
                      {t.description && (
                        <div className="text-[11px] text-slate-400">{t.description}</div>
                      )}
                      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                        <span>Owner: {t.owner_name}</span>
                        {t.due_date && <span>Due: {t.due_date}</span>}
                        {t.sponsor_campaign_id && (
                          <span>
                            Campaign:{' '}
                            {campaignMap.get(t.sponsor_campaign_id) ?? t.sponsor_campaign_id}
                          </span>
                        )}
                        {t.brand_id && (
                          <span>Brand: {brandMap.get(t.brand_id) ?? t.brand_id}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Status for ${t.title}`}
                        value={t.status}
                        onChange={(e) => void handleStatusChange(t.id, e.target.value as TaskStatus)}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                      >
                        <option value="todo">todo</option>
                        <option value="in_progress">in_progress</option>
                        <option value="done">done</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleDelete(t.id)}
                        className="rounded border border-rose-500/30 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
