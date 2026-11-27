'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PendingCopilotAction } from '@/lib/copilot-tools';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: Array<{ tool: string; args: Record<string, unknown> }>;
  pendingActions?: Array<
    PendingCopilotAction & { status?: 'pending' | 'executed' | 'dismissed'; error?: string }
  >;
}

const STARTER_PROMPTS = [
  'Which team member is overloaded on zero-ROI work and how should we rebalance?',
  'Show confirmed cash vs in-kind barter and open pipeline by industry in a table.',
  'Which target companies should we call for the Reverse-Brief Hackathon?',
  'What are my assigned tasks and target companies right now?',
];

const FOLLOW_UP_CHIPS = [
  'Which channels should we double down on?',
  'Show stalled open deals',
  "Did Beardo's sponsorship increase attendance?",
];

export function CopilotDrawer() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userTurn: ChatTurn = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const nextHistory = [...messages, userTurn];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const assistantTurn: ChatTurn = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        toolTrace: data.toolTrace ?? [],
        pendingActions: (data.pendingActions ?? []).map((a: PendingCopilotAction) => ({
          ...a,
          status: 'pending',
        })),
      };
      setMessages((prev) => [...prev, assistantTurn]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copilot request failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmAction(turnId: string, action: PendingCopilotAction) {
    try {
      const res = await fetch('/api/analyst/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId: action.actionId,
          tool: action.tool,
          payload: action.payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === turnId
            ? {
                ...m,
                pendingActions: m.pendingActions?.map((a) =>
                  a.actionId === action.actionId ? { ...a, status: 'executed' } : a
                ),
              }
            : m
        )
      );
      router.refresh();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === turnId
            ? {
                ...m,
                pendingActions: m.pendingActions?.map((a) =>
                  a.actionId === action.actionId
                    ? { ...a, error: err instanceof Error ? err.message : 'Failed' }
                    : a
                ),
              }
            : m
        )
      );
    }
  }

  function handleDismissAction(turnId: string, actionId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === turnId
          ? {
              ...m,
              pendingActions: m.pendingActions?.map((a) =>
                a.actionId === actionId ? { ...a, status: 'dismissed' } : a
              ),
            }
          : m
      )
    );
  }

  return (
    <div className="h-full min-h-[520px] rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Diagnose · AI Growth Copilot</h2>
          <p className="text-[11px] text-slate-400">
            Gemini 3.5 Flash Lite · Role-Scoped · Structured Markdown
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Ask any role-scoped question about CampusFest 2025 performance, target companies,
              workforce load, or your assigned tasks.
            </p>
            <div className="space-y-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Suggested Prompts
              </div>
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="w-full text-left rounded-lg border border-slate-800 bg-slate-950/70 hover:border-emerald-500/40 hover:bg-slate-950 px-3 py-2 text-xs text-slate-300 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`space-y-2 ${m.role === 'user' ? 'flex flex-col items-end' : ''}`}
              >
                <div
                  className={`rounded-lg px-3 py-2.5 text-xs leading-relaxed max-w-[98%] ${
                    m.role === 'user'
                      ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-100 whitespace-pre-wrap'
                      : 'bg-slate-950/85 border border-slate-800 text-slate-200 overflow-x-auto'
                  }`}
                >
                  {m.role === 'user' ? (
                    m.content
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => (
                          <h3 className="text-xs font-bold text-emerald-300 mt-2 mb-1">{children}</h3>
                        ),
                        h2: ({ children }) => (
                          <h3 className="text-xs font-bold text-emerald-300 mt-2 mb-1">{children}</h3>
                        ),
                        h3: ({ children }) => (
                          <h4 className="text-xs font-semibold text-sky-300 mt-2 mb-1">{children}</h4>
                        ),
                        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                        ul: ({ children }) => (
                          <ul className="list-disc pl-4 space-y-0.5 mb-1.5">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-4 space-y-0.5 mb-1.5">{children}</ol>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-white">{children}</strong>
                        ),
                        table: ({ children }) => (
                          <div className="my-2 overflow-x-auto rounded border border-slate-800">
                            <table className="w-full text-left text-[11px]">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-slate-900 text-slate-300 border-b border-slate-800">
                            {children}
                          </thead>
                        ),
                        th: ({ children }) => <th className="px-2 py-1 font-semibold">{children}</th>,
                        td: ({ children }) => (
                          <td className="px-2 py-1 border-t border-slate-800/60 tabular-nums">
                            {children}
                          </td>
                        ),
                        code: ({ children }) => (
                          <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[10px] text-sky-300">
                            {children}
                          </code>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  )}
                </div>

                {m.toolTrace && m.toolTrace.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.toolTrace.map((t, i) => (
                      <span
                        key={`${t.tool}_${i}`}
                        className="rounded bg-slate-800/90 border border-slate-700/70 px-1.5 py-0.5 font-mono text-[10px] text-sky-300"
                      >
                        {t.tool}()
                      </span>
                    ))}
                  </div>
                )}

                {m.pendingActions &&
                  m.pendingActions.map((act) => (
                    <div
                      key={act.actionId}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-200">
                          Proposed Action ({act.tool})
                        </span>
                        <span className="font-mono text-[10px] text-amber-300">
                          {act.status === 'executed'
                            ? 'Saved'
                            : act.status === 'dismissed'
                              ? 'Cancelled'
                              : 'Needs Confirmation'}
                        </span>
                      </div>
                      <p className="text-slate-200">{act.summary}</p>
                      {act.error && <p className="text-rose-300 text-[11px]">{act.error}</p>}
                      {act.status === 'pending' && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => void handleConfirmAction(m.id, act)}
                            className="rounded-md bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-500"
                          >
                            Confirm &amp; Execute
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissAction(m.id, act.actionId)}
                            className="rounded-md border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ))}

            {!loading && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {FOLLOW_UP_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void sendMessage(chip)}
                    className="rounded-full border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:border-slate-600"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400 animate-pulse">
            Querying SQL/dataset tools and analyzing...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
        className="p-3 border-t border-slate-800 flex items-center gap-2 bg-slate-950/60"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about channels, targets, tasks..."
          disabled={loading}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
