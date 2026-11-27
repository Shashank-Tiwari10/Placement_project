import { NextRequest, NextResponse } from 'next/server';
import { runGroundedAnalyst } from '@/lib/analyst-engine';
import {
  findTeamMemberByPhone,
  listWhatsAppLogs,
  recordWhatsAppLog,
} from '@/lib/repository';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import type { SessionPrincipal } from '@/lib/types';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const mode = sp.get('hub.mode');
  const token = sp.get('hub.verify_token');
  const challenge = sp.get('hub.challenge');

  if (mode === 'subscribe' && challenge) {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN || 'campusfest-verify';
    if (token === expected) {
      return new NextResponse(challenge, { status: 200 });
    }
    return NextResponse.json({ error: 'Verify token mismatch' }, { status: 403 });
  }

  const logs = await listWhatsAppLogs(50);
  return NextResponse.json({ logs });
}

export async function POST(request: NextRequest) {
  try {
    let fromPhone = '';
    let messageText = '';

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      fromPhone = params.get('From') || '';
      messageText = params.get('Body') || '';
    } else {
      const json = (await request.json()) as { from?: string; body?: string };
      fromPhone = json.from || '';
      messageText = json.body || '';
    }

    fromPhone = fromPhone.trim();
    messageText = messageText.trim();
    if (!fromPhone || !messageText) {
      return NextResponse.json({ error: 'from and body are required' }, { status: 400 });
    }

    const member = await findTeamMemberByPhone(fromPhone);
    if (!member) {
      await recordWhatsAppLog({
        direction: 'inbound',
        member_id: null,
        phone_e164: fromPhone,
        message_body: messageText,
        provider_status: 'unregistered_sender',
      });
      return NextResponse.json(
        {
          ok: false,
          reply:
            'Your WhatsApp number is not registered in CampusFest 2025 team_members. Ask a Head or Manager to add your phone.',
        },
        { status: 403 }
      );
    }

    await recordWhatsAppLog({
      direction: 'inbound',
      member_id: member.member_id,
      phone_e164: member.phone_e164,
      message_body: messageText,
      provider_status: 'received',
    });

    const principal: SessionPrincipal = {
      member_id: member.member_id,
      full_name: member.full_name,
      role: member.role,
      assigned_verticals: member.assigned_verticals,
    };

    const analyst = await runGroundedAnalyst({
      messages: [{ role: 'user', content: messageText }],
      principal,
      channel: 'whatsapp',
    });

    const outbound = await sendWhatsAppMessage({
      toPhone: member.phone_e164,
      memberId: member.member_id,
      body: analyst.reply,
    });

    return NextResponse.json({
      ok: true,
      member: { member_id: member.member_id, full_name: member.full_name, role: member.role },
      reply: analyst.reply,
      toolTrace: analyst.toolTrace,
      outboundLog: outbound,
    });
  } catch (err) {
    console.error('[POST /api/whatsapp/webhook] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'WhatsApp webhook failed' },
      { status: 500 }
    );
  }
}
