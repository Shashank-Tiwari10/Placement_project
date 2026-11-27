import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { createCampaign, listCampaignsWithMeta, VALID_CHANNELS } from '@/lib/repository';
import type { CampaignChannel } from '@/lib/types';

export async function GET() {
  try {
    const data = await listCampaignsWithMeta();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[GET /api/campaigns] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load campaigns' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrincipal(['head', 'manager']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const campaign_name = typeof body.campaign_name === 'string' ? body.campaign_name : '';
    const channel = typeof body.channel === 'string' ? (body.channel as CampaignChannel) : null;
    const objective = typeof body.objective === 'string' ? body.objective : '';
    const audience = typeof body.audience === 'string' ? body.audience : '';
    const owner_name = typeof body.owner_name === 'string' ? body.owner_name : '';

    if (!campaign_name.trim() || !channel || !VALID_CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: 'campaign_name and valid channel (email, linkedin, introduction, web_inbound) required' },
        { status: 400 }
      );
    }

    const created = await createCampaign({
      campaign_name,
      channel,
      objective,
      audience,
      owner_name,
      idempotency_key: typeof body.idempotency_key === 'string' ? body.idempotency_key : undefined,
    });

    return NextResponse.json({ ok: true, campaign: created }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create campaign';
    console.error('[POST /api/campaigns] failed:', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
