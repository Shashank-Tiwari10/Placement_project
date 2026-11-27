import { NextRequest, NextResponse } from 'next/server';
import { runGroundedAnalyst, type AnalystMessage } from '@/lib/analyst-engine';
import { requirePrincipal } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const auth = await requirePrincipal();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      messages?: AnalystMessage[];
      asOf?: string | null;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    const result = await runGroundedAnalyst({
      messages,
      principal: auth.principal,
      asOf: body.asOf ?? null,
      channel: 'dashboard',
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/analyst] failed:', err);
    const status =
      typeof (err as { status?: unknown })?.status === 'number'
        ? (err as { status: number }).status
        : 500;
    const rawMsg = err instanceof Error ? err.message : 'Analyst request failed';
    const cleanMsg =
      status === 402 || rawMsg.includes('prepayment credits')
        ? 'Gemini API prepayment credits are depleted (HTTP 402). Top up credits or use a free-tier AI Studio key in .env.local.'
        : rawMsg;
    return NextResponse.json(
      { error: cleanMsg },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
