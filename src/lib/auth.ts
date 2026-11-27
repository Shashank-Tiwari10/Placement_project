import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { DEFAULT_TEAM_MEMBERS } from './v3-defaults.ts';
import type { SessionPrincipal, TeamRole } from './types.ts';

export const SESSION_COOKIE_NAME = 'cf_session';

function getSecret(): string {
  return process.env.SESSION_SECRET?.trim() || 'campusfest-demo-signing-secret-v3';
}

export function signPrincipalToken(principal: SessionPrincipal): string {
  const payload = Buffer.from(JSON.stringify(principal), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyPrincipalToken(token: string | undefined): SessionPrincipal | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPrincipal;
    if (!parsed?.member_id || !parsed?.role || !parsed?.full_name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getDefaultHeadPrincipal(): SessionPrincipal {
  const head = DEFAULT_TEAM_MEMBERS[0];
  return {
    member_id: head.member_id,
    full_name: head.full_name,
    role: head.role,
    assigned_verticals: head.assigned_verticals,
  };
}

export async function getSessionPrincipal(): Promise<SessionPrincipal> {
  try {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE_NAME)?.value;
    const verified = verifyPrincipalToken(raw);
    if (verified) return verified;
  } catch {
    // Fallback outside request scope (e.g. CLI scripts)
  }
  return getDefaultHeadPrincipal();
}

export async function requirePrincipal(
  allowedRoles?: TeamRole[]
): Promise<
  | { ok: true; principal: SessionPrincipal }
  | { ok: false; status: 403; error: string; principal: SessionPrincipal }
> {
  const principal = await getSessionPrincipal();
  if (allowedRoles && !allowedRoles.includes(principal.role)) {
    return {
      ok: false,
      status: 403,
      error: `Access denied for role "${principal.role}". Required: ${allowedRoles.join(' or ')}.`,
      principal,
    };
  }
  return { ok: true, principal };
}

export function rolePermissions(role: TeamRole) {
  return {
    canViewOrgMetrics: role === 'head' || role === 'manager',
    canEditConfirmedMoney: role === 'head',
    canEditPipelineStage: role === 'head' || role === 'manager',
    canManageWorkforce: role === 'head' || role === 'manager',
    canReassignAnyOwner: role === 'head',
    canManageCampaigns: role === 'head' || role === 'manager',
    canPromoteTargets: role === 'head' || role === 'manager',
    canDeleteTasks: role === 'head' || role === 'manager',
    canAssignTasks: role === 'head' || role === 'manager',
    canReservePackages: role === 'head' || role === 'manager',
  };
}
