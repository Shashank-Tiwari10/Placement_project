'use client';

import { useState } from 'react';
import { AppShell } from './AppShell';
import { formatCompactInr } from '@/lib/format';
import type { CampaignChannel, CampaignPerfRow } from '@/lib/types';

interface CampaignItem extends CampaignPerfRow {
  objective: string;
  audience: string;
}

interface CampaignsManagerProps {
  initialItems: CampaignItem[];
  mode: 'supabase' | 'local';
}

export function CampaignsManager({ initialItems, mode }: CampaignsManagerProps) {
  const [items, setItems] = useState<CampaignItem[]>(initialItems);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CampaignChannel>('introduction');
  const [objective, setObjective] = useState('');
  const [audience, setAudience] = useState('');
  const [owner, setOwner] = useState('Riya Kapoor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: name,
          channel,
          objective,
          audience,
          owner_name: owner,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const listRes = await fetch('/api/campaigns', { cache: 'no-store' });
      const listData = await listRes.json();
      if (listRes.ok) setItems(listData.items);

      setSuccess(`Created acquisition campaign "${name}".`);
      setName('');
      setObjective('');
      setAudience('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell mode={mode}>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-lg font-semibold text-slate-100">
            Manage · Sponsorship Acquisition Campaigns
          </h1>
          <p className="text-xs text-slate-400">
            Track the 6 existing acquisition motions and launch new high-trust motions.
          </p>
        </section>

        {/* Campaign cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((c) => {
            const isDead = c.confirmed_deals === 0 && c.interactions >= 100;
            return (
              <div
                key={c.sponsor_campaign_id}
                className={`rounded-xl border p-4 bg-slate-900/70 ${
                  c.confirmed_deals > 0
                    ? 'border-emerald-500/30'
                    : isDead
                      ? 'border-rose-500/25'
                      : 'border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{c.campaign_name}</div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {c.sponsor_campaign_id} · {c.channel} · Owner: {c.owner_name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-emerald-300">
                      {formatCompactInr(c.confirmed_value_inr)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {c.confirmed_deals} confirmed · {c.open_deals} open
                    </div>
                  </div>
                </div>

                {c.objective && (
                  <p className="mt-2.5 text-xs text-slate-300">{c.objective}</p>
                )}
                {c.audience && (
                  <p className="mt-1 text-[11px] text-slate-400">Audience: {c.audience}</p>
                )}

                <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-3 text-[11px] text-slate-300 font-mono">
                  <span>Interactions: {c.interactions}</span>
                  <span>Brands: {c.brands_reached}</span>
                  <span>Meetings: {c.meetings_held_brands}</span>
                  <span>Open: {formatCompactInr(c.open_pipeline_inr)}</span>
                </div>
              </div>
            );
          })}
        </section>

        {/* Add new campaign */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-semibold text-slate-100 mb-3">
            Launch New Acquisition Campaign
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 mb-1">Campaign Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Alumni Founder Introductions"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as CampaignChannel)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                >
                  <option value="introduction">introduction</option>
                  <option value="web_inbound">web_inbound</option>
                  <option value="linkedin">linkedin</option>
                  <option value="email">email</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Owner</label>
                <input
                  type="text"
                  required
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Objective</label>
              <input
                type="text"
                required
                placeholder="Convert alumni referrals into title/gold sponsor meetings"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Target Audience</label>
              <input
                type="text"
                required
                placeholder="D2C & Fintech founders in Delhi NCR"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between gap-3 pt-1">
              <div className="text-xs">
                {error && <span className="text-rose-300">{error}</span>}
                {success && <span className="text-emerald-300">{success}</span>}
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
