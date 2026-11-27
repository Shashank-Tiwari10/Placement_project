'use client';

import { useCallback, useMemo, useState } from 'react';
import { AppShell } from './AppShell';
import { formatCompactInr, formatInr, formatIstDate, formatPct } from '@/lib/format';
import type { MeasureSnapshot } from '@/lib/types';

interface MeasureDashboardProps {
  initialData: MeasureSnapshot;
}

const SNAPSHOT_PRESETS = [
  { label: 'Latest (20 Apr)', value: '' },
  { label: 'Event Day (12 Apr)', value: '2025-04-12' },
  { label: 'Revised Plan (15 Mar)', value: '2025-03-15' },
  { label: 'Mid-Campaign (28 Feb)', value: '2025-02-28' },
  { label: 'Early Launch (31 Jan)', value: '2025-01-31' },
];

function getCampaignVerdict(c: MeasureSnapshot['campaigns'][number]) {
  if (c.confirmed_deals >= 7 && c.interactions <= 80) {
    return {
      label: 'Double Down',
      classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    };
  }
  if (c.confirmed_deals === 0 && c.interactions >= 200) {
    return {
      label: 'Kill / Cut',
      classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    };
  }
  if (c.confirmed_deals === 0 && c.open_deals === 0) {
    return {
      label: 'Deprioritise',
      classes: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    };
  }
  if (c.confirmed_deals === 0 && c.open_deals > 0) {
    return {
      label: 'Monitor (Pipeline)',
      classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    };
  }
  return {
    label: 'Invest',
    classes: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  };
}

export function MeasureDashboard({ initialData }: MeasureDashboardProps) {
  const [data, setData] = useState<MeasureSnapshot>(initialData);
  const [asOf, setAsOf] = useState<string>(initialData.meta.as_of ?? '');
  const [selectedTargetVersion, setSelectedTargetVersion] = useState<string>(
    initialData.targets.find((t) => t.is_latest)?.target_version ??
      initialData.targets[0]?.target_version ??
      ''
  );
  const [status, setStatus] = useState<'success' | 'loading' | 'error'>('success');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSnapshot = useCallback(async (nextAsOf: string) => {
    setStatus('loading');
    setErrorMsg(null);
    try {
      const qs = nextAsOf ? `?asOf=${encodeURIComponent(nextAsOf)}` : '';
      const res = await fetch(`/api/metrics${qs}`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      setData(payload as MeasureSnapshot);
      const targets = (payload as MeasureSnapshot).targets;
      if (targets.length > 0) {
        setSelectedTargetVersion((prev) =>
          targets.some((t) => t.target_version === prev)
            ? prev
            : targets.find((t) => t.is_latest)?.target_version ?? targets[0].target_version
        );
      }
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to refresh metrics');
      setStatus('error');
    }
  }, []);

  const activeTarget = useMemo(() => {
    return (
      data.targets.find((t) => t.target_version === selectedTargetVersion) ??
      data.targets[0] ??
      null
    );
  }, [data.targets, selectedTargetVersion]);

  const funnelStages = useMemo(() => {
    const f = data.funnel;
    const maxCount = Math.max(f.researched_brands, 1);
    return [
      { label: 'Researched', count: f.researched_brands, note: 'Target brand universe', pctBase: f.researched_brands },
      { label: 'Outreach sent', count: f.outreach_sent_brands, note: 'At least 1 outreach event', pctBase: f.researched_brands },
      { label: 'Engaged or qualified', count: f.engaged_or_qualified_brands, note: 'Latest status engaged/qualified', pctBase: f.outreach_sent_brands },
      { label: 'Meeting held', count: f.meeting_held_brands, note: 'Distinct brands with meeting_held', pctBase: f.outreach_sent_brands },
      { label: 'Qualified', count: f.qualified_brands, note: 'Brand fit confirmed', pctBase: f.outreach_sent_brands },
      { label: 'Opportunity created', count: f.opportunity_brands, note: 'Distinct brands w/ opp', pctBase: f.qualified_brands },
      { label: 'Partner confirmed', count: f.confirmed_brands, note: 'Money stage (latest = confirmed)', pctBase: f.qualified_brands },
    ].map((s) => ({
      ...s,
      widthPct: Math.max(4, Math.round((s.count / maxCount) * 100)),
    }));
  }, [data.funnel]);

  const isEmpty = data.funnel.researched_brands === 0;

  return (
    <AppShell mode={data.meta.mode}>
      <div className="space-y-6">
        {/* Top control bar */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-100">
                Measure · Sponsorship Funnel &amp; Economics
              </h1>
              {status === 'loading' && (
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 animate-pulse">
                  Recomputing...
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Dataset window: {data.meta.history_start} to {data.meta.history_end} (Asia/Kolkata) ·{' '}
              {asOf ? `Snapshot as of ${asOf} 23:59 IST` : 'Current latest state'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Point-in-time snapshot selector (no future leakage) */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="asOfSelect" className="text-xs text-slate-400">
                As-of:
              </label>
              <select
                id="asOfSelect"
                value={asOf}
                onChange={(e) => {
                  const val = e.target.value;
                  setAsOf(val);
                  void loadSnapshot(val);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {SNAPSHOT_PRESETS.map((p) => (
                  <option key={p.label} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Target version toggle */}
            {data.targets.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label htmlFor="targetSelect" className="text-xs text-slate-400">
                  Target plan:
                </label>
                <select
                  id="targetSelect"
                  value={selectedTargetVersion}
                  onChange={(e) => setSelectedTargetVersion(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {data.targets.map((t) => (
                    <option key={t.target_version} value={t.target_version}>
                      {t.target_version} ({t.qualified_brands_goal}Q / {t.confirmed_partnerships_goal}C)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Error state */}
        {status === 'error' && errorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-center justify-between gap-4">
            <div className="text-xs text-rose-200">
              <span className="font-semibold">Failed to load snapshot:</span> {errorMsg}
            </div>
            <button
              type="button"
              onClick={() => void loadSnapshot(asOf)}
              className="rounded-md bg-rose-500/20 border border-rose-400/40 px-3 py-1 text-xs font-medium text-rose-100 hover:bg-rose-500/30"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {isEmpty ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center">
            <div className="text-sm font-medium text-slate-200">
              No sponsorship records exist on or before {asOf || 'this date'}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Select a later as-of snapshot date between {data.meta.history_start} and{' '}
              {data.meta.history_end}.
            </p>
          </div>
        ) : (
          <>
            {/* KPI Strip */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Confirmed Cash */}
              <div className="rounded-xl border border-emerald-500/30 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Confirmed Cash
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">[data]</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-emerald-300 tabular-nums">
                  {formatCompactInr(data.cash_breakdown.confirmed_cash_inr)}
                </div>
                <div className="mt-1 text-xs text-slate-400 tabular-nums">
                  {data.cash_breakdown.confirmed_cash_count} cash deals · +{' '}
                  {formatCompactInr(data.cash_breakdown.confirmed_in_kind_inr)} in-kind (
                  {data.cash_breakdown.confirmed_in_kind_count})
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                  Total: {formatInr(data.cash.confirmed_value_inr)} (avg{' '}
                  {formatCompactInr(data.cash.avg_confirmed_deal_inr)})
                </div>
              </div>

              {/* Collected Before Event */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Collected Pre-Event
                  </span>
                  <span className="text-[10px] font-mono text-amber-400">lever</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-100 tabular-nums">
                  {formatCompactInr(data.cash.collected_value_inr)}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Confirmed ≠ bank receipt; track pre-event collection in Pipeline.
                </div>
              </div>

              {/* Open Pipeline */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Active Open Pipeline
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">[data]</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-sky-300 tabular-nums">
                  {formatCompactInr(data.cash.open_pipeline_inr)}
                </div>
                <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                  {data.cash.open_count} live · {data.cash.withdrawn_count} withdrawn (
                  {formatCompactInr(data.cash.withdrawn_value_inr)}) · {data.cash.lost_count} lost (
                  {formatCompactInr(data.cash.lost_value_inr)})
                </div>
              </div>

              {/* Targets vs Actuals */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Targets vs Actuals
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">[data]</span>
                </div>
                {activeTarget ? (
                  <>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-100 tabular-nums">
                        {activeTarget.actual_confirmed_partnerships}
                        <span className="text-sm font-normal text-slate-400">
                          /{activeTarget.confirmed_partnerships_goal}
                        </span>
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          activeTarget.confirmed_variance >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {activeTarget.confirmed_variance >= 0 ? '+' : ''}
                        {activeTarget.confirmed_variance} deals
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                      Qualified: {activeTarget.actual_qualified_brands}/
                      {activeTarget.qualified_brands_goal} (
                      {activeTarget.qualified_variance >= 0 ? '+' : ''}
                      {activeTarget.qualified_variance})
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">No target active at this date</div>
                )}
              </div>

              {/* Projected Outcome */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Projected Strategy
                  </span>
                  <span className="text-[10px] font-mono text-sky-400">[assumption]</span>
                </div>
                <div className="mt-2 text-lg font-bold text-slate-100 tabular-nums">
                  Base: 30–32 deals
                </div>
                <div className="mt-0.5 text-xs text-emerald-300 tabular-nums">
                  ₹30–33L (close open pipeline)
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Stretch: 38–42 deals / ₹45–55L
                </div>
              </div>
            </section>

            {/* Funnel + Conversion Rates */}
            <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      Brand Acquisition Funnel (Distinct Brands)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Each stage counts distinct brands — outreach attempts are never counted as
                      qualified brands.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {funnelStages.map((s) => (
                    <div key={s.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-200">{s.label}</span>
                          <span className="text-[11px] text-slate-500">{s.note}</span>
                        </div>
                        <div className="font-mono tabular-nums text-slate-200">
                          {s.count}{' '}
                          <span className="text-slate-500">
                            ({formatPct(s.count, data.funnel.researched_brands)})
                          </span>
                        </div>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-950 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.label === 'Partner confirmed'
                              ? 'bg-emerald-500'
                              : s.label === 'Qualified'
                                ? 'bg-sky-500'
                                : 'bg-slate-600'
                          }`}
                          style={{ width: `${s.widthPct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conversion economics card */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Stage Conversion Rates &amp; Economics
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Anchor rates computed deterministically from SQL/dataset views.
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                      <span className="text-xs text-slate-300">Outreach → Qualified</span>
                      <span className="font-mono text-sm font-semibold text-sky-300">
                        {formatPct(data.funnel.qualified_brands, data.funnel.outreach_sent_brands)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                      <span className="text-xs text-slate-300">Qualified → Confirmed</span>
                      <span className="font-mono text-sm font-semibold text-emerald-300">
                        {formatPct(data.funnel.confirmed_brands, data.funnel.qualified_brands)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                      <span className="text-xs text-slate-300">
                        Researched → Confirmed (End-to-End)
                      </span>
                      <span className="font-mono text-sm font-semibold text-slate-100">
                        {formatPct(data.funnel.confirmed_brands, data.funnel.researched_brands)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                      <span className="text-xs text-slate-300">Avg Confirmed Deal Size</span>
                      <span className="font-mono text-sm font-semibold text-emerald-300">
                        {formatInr(data.cash.avg_confirmed_deal_inr)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200/90">
                  <span className="font-semibold">Gap diagnosis:</span> Qualified goal beat (+
                  {Math.max(0, data.funnel.qualified_brands - (activeTarget?.qualified_brands_goal ?? 55))}
                  ), but confirmed deals trail target by{' '}
                  {Math.max(0, (activeTarget?.confirmed_partnerships_goal ?? 28) - data.cash.confirmed_count)}
                  . Closing {formatCompactInr(data.cash.open_pipeline_inr)} open pipeline is the
                  fastest lever.
                </div>
              </div>
            </section>

            {/* Headline Diagnosis: Channel-Efficiency Table */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Channel &amp; Campaign Efficiency (Originating Attribution)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Warm Intros, Creator Referrals, and Partner Interest Form produced 100% of
                    confirmed cash; cold email channels produced ₹0 on 621 interactions.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-2.5 pr-4">Campaign</th>
                      <th className="py-2.5 px-3">Channel</th>
                      <th className="py-2.5 px-3 text-right">Interactions</th>
                      <th className="py-2.5 px-3 text-right">Brands</th>
                      <th className="py-2.5 px-3 text-right">Meetings</th>
                      <th className="py-2.5 px-3 text-right">Opps</th>
                      <th className="py-2.5 px-3 text-right">Confirmed</th>
                      <th className="py-2.5 px-3 text-right">Confirmed ₹</th>
                      <th className="py-2.5 px-3 text-right">Open ₹</th>
                      <th className="py-2.5 pl-3 text-right">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {data.campaigns.map((c) => {
                      const verdict = getCampaignVerdict(c);
                      return (
                        <tr key={c.sponsor_campaign_id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 pr-4 font-medium text-slate-100">
                            {c.campaign_name}
                            <span className="ml-2 text-[10px] font-mono text-slate-500">
                              {c.sponsor_campaign_id}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{c.channel}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{c.interactions}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{c.brands_reached}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {c.meetings_held_brands}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {c.opportunities_created}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-slate-100">
                            {c.confirmed_deals}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-emerald-300">
                            {formatCompactInr(c.confirmed_value_inr)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-300">
                            {formatCompactInr(c.open_pipeline_inr)}
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${verdict.classes}`}
                            >
                              {verdict.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Industry Verticals & Package Fit */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Industry Verticals &amp; Unclosed Cash Pools
                  </h2>
                  <p className="text-xs text-slate-400">
                    Consumer Products and Education hold the majority of stalled open pipeline —
                    ideal targets for IIT-style experiential zones and hackathons.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.industries.map((ind) => (
                  <div
                    key={ind.industry}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-100">{ind.industry}</div>
                      <div className="text-[11px] text-slate-400">
                        {ind.total_brands} brands · {ind.confirmed_deals} confirmed
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums">
                      <div className="text-emerald-300 font-semibold">
                        {formatCompactInr(ind.confirmed_value_inr)}
                      </div>
                      <div className="text-[11px] text-sky-300">
                        {ind.open_deals} open ({formatCompactInr(ind.open_pipeline_inr)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Bottlenecks + Observational Activations */}
            <section className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      Bottlenecks · Stalled Open Opportunities
                    </h2>
                    <p className="text-xs text-slate-400">
                      Active deals ranked by days without a stage transition.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    {data.bottlenecks.length} open
                  </span>
                </div>

                {data.bottlenecks.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
                    No open opportunities stalled at this snapshot.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                          <th className="py-2 pr-3">Brand</th>
                          <th className="py-2 px-2">Stage</th>
                          <th className="py-2 px-2 text-right">Proposed ₹</th>
                          <th className="py-2 px-2 text-right">Stalled</th>
                          <th className="py-2 pl-2">Owner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {data.bottlenecks.slice(0, 8).map((b) => (
                          <tr key={b.opportunity_id} className="hover:bg-slate-800/30">
                            <td className="py-2 pr-3 font-medium text-slate-200">
                              {b.brand_name}
                              <div className="text-[10px] text-slate-500">
                                {b.originating_campaign_name}
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                                {b.stage}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums text-sky-300">
                              {formatCompactInr(b.proposed_value_inr)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums text-amber-300">
                              {b.days_in_stage}d
                            </td>
                            <td className="py-2 pl-2 text-slate-400">{b.owner_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Observational Activations */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-100">
                    Sponsor Activations
                  </h2>
                  <span className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                    Association ≠ Causation
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Links confirmed deals to attendee campaigns. Records observational association
                  only — does not prove causal attendee uplift.
                </p>

                {data.activations.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
                    No activations linked as of this date.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data.activations.map((a) => (
                      <div
                        key={a.activation_id}
                        className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-100">{a.brand_name}</span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {formatIstDate(a.linked_at)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-sky-300">
                          Linked campaign: {a.attendee_campaign_name} ({a.attendee_campaign_id})
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">{a.activation_note}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
