import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionPrincipal,
  SESSION_COOKIE_NAME,
  signPrincipalToken,
} from '@/lib/auth';
import { authenticateMember, listTeamMembers } from '@/lib/repository';
import type { SessionPrincipal } from '@/lib/types';

export async function GET() {
  const [principal, members] = await Promise.all([
    getSessionPrincipal(),
    listTeamMembers(),
  ]);
  return NextResponse.json({
    principal,
    members,
    demoSwitcherEnabled: process.env.ENABLE_DEMO_ROLE_SWITCHER !== 'false',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      member_id?: string;
      pin?: string;
      demo_switch?: boolean;
    };
    const memberId = body.member_id?.trim() ?? '';
    if (!memberId) {
      return NextResponse.json({ error: 'member_id is required' }, { status: 400 });
    }

    const member = await authenticateMember(memberId, body.pin, Boolean(body.demo_switch));
    if (!member) {
      return NextResponse.json({ error: 'Invalid member or PIN' }, { status: 401 });
    }

    const principal: SessionPrincipal = {
      member_id: member.member_id,
      full_name: member.full_name,
      role: member.role,
      assigned_verticals: member.assigned_verticals,
    };

    const token = signPrincipalToken(principal);
    const res = NextResponse.json({ ok: true, principal });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    console.error('[POST /api/auth/session] failed:', err);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
