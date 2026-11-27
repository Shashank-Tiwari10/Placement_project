'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppShell } from './AppShell';
import { formatIstDate } from '@/lib/format';
import type { TeamMemberRow, WhatsAppLogRow } from '@/lib/types';

interface WhatsAppConsoleProps {
  initialLogs: WhatsAppLogRow[];
  members: TeamMemberRow[];
  twilioConfigured: boolean;
  mode: 'supabase' | 'local';
}

export function WhatsAppConsole({
  initialLogs,
  members,
  twilioConfigured,
  mode,
}: WhatsAppConsoleProps) {
  const [logs, setLogs] = useState<WhatsAppLogRow[]>(initialLogs);
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.member_id ?? 'T02');
  const [message, setMessage] = useState('What are my assigned tasks and target companies?');
  const [sending, setSending] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedMember = members.find((m) => m.member_id === selectedMemberId) ?? members[0];
  const memberMap = new Map(members.map((m) => [m.member_id, m]));

  async function refreshLogs() {
    const res = await fetch('/api/whatsapp/webhook', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setLogs(data.logs ?? []);
  }

  async function handleSimulateInbound(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMember || !message.trim()) return;
    setSending(true);
    setError(null);
    setLastReply(null);
    try {
      const res = await fetch('/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: selectedMember.phone_e164,
          body: message,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Webhook failed');
      setLastReply(data.reply);
      await refreshLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to simulate WhatsApp message');
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell mode={mode}>
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              WhatsApp · Teammate Notifications &amp; AI Chatbot
            </h1>
            <p className="text-xs text-slate-400">
              Task assignments trigger automatic WhatsApp alerts; inbound messages route through
              the same role-scoped AI engine.
            </p>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              twilioConfigured
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}
          >
            {twilioConfigured ? 'Twilio Live' : 'Local Outbox Simulator'}
          </span>
        </section>

        {/* Inbound Simulator */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Simulate Teammate WhatsApp Message
            </h2>
            <p className="text-xs text-slate-400">
              Test how a Head, Manager, or Coordinator gets different role-scoped AI replies on
              WhatsApp (`POST /api/whatsapp/webhook`).
            </p>
          </div>

          <form onSubmit={handleSimulateInbound} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 mb-1">Sender Teammate</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                {members.map((m) => (
                  <option key={m.member_id} value={m.member_id}>
                    {m.full_name} ({m.role.toUpperCase()} · {m.phone_e164})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-slate-300 mb-1">WhatsApp Message</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {sending ? 'Replying...' : 'Send'}
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          {lastReply && (
            <div className="rounded-lg border border-emerald-500/30 bg-slate-950/80 p-3.5 text-xs text-slate-200">
              <div className="text-[10px] font-mono uppercase text-emerald-400 mb-1.5">
                WhatsApp Bot Reply to {selectedMember?.full_name} ({selectedMember?.role})
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{lastReply}</ReactMarkdown>
            </div>
          )}
        </section>

        {/* Message Log */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-100">
              WhatsApp Outbox &amp; Inbound Log ({logs.length})
            </h2>
            <button
              type="button"
              onClick={() => void refreshLogs()}
              className="text-xs text-sky-300 hover:text-sky-200"
            >
              Refresh
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
              No WhatsApp messages logged yet. Assign a task in /tasks or simulate a message above.
            </div>
          ) : (
            <div className="space-y-2.5">
              {logs.map((l) => {
                const mem = l.member_id ? memberMap.get(l.member_id) : null;
                return (
                  <div
                    key={l.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                            l.direction === 'outbound'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-sky-500/15 text-sky-300'
                          }`}
                        >
                          {l.direction}
                        </span>
                        <span className="font-medium text-slate-200">
                          {mem ? `${mem.full_name} (${mem.role})` : l.phone_e164}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">
                        {l.provider_status} · {formatIstDate(l.created_at)}
                      </span>
                    </div>
                    <div className="text-slate-300 whitespace-pre-wrap">{l.message_body}</div>
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
