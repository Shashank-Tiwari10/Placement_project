-- v3 Expansion: 3-Tier Hierarchical RBAC, Per-Event Target Companies & WhatsApp Logs

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Team members & 3-tier hierarchy (head -> manager -> coordinator)
CREATE TABLE IF NOT EXISTS public.team_members (
  member_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('head', 'manager', 'coordinator')),
  reports_to_id TEXT NULL REFERENCES public.team_members(member_id) ON DELETE SET NULL,
  phone_e164 TEXT NOT NULL,
  assigned_verticals TEXT[] NOT NULL DEFAULT '{}',
  pin_code TEXT NOT NULL DEFAULT '1111',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Target companies per event package (isolated from historical 180 brands)
CREATE TABLE IF NOT EXISTS public.target_companies (
  target_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Delhi NCR',
  package_id TEXT NOT NULL REFERENCES public.event_packages(package_id) ON DELETE RESTRICT,
  fit_rationale TEXT NOT NULL,
  estimated_ticket_inr BIGINT NOT NULL DEFAULT 0 CHECK (estimated_ticket_inr >= 0),
  contact_role_hint TEXT NOT NULL DEFAULT 'Brand Marketing Lead',
  priority TEXT NOT NULL DEFAULT 'p1' CHECK (priority IN ('p0', 'p1', 'p2')),
  outreach_status TEXT NOT NULL DEFAULT 'shortlisted' CHECK (
    outreach_status IN ('shortlisted', 'assigned', 'contacted', 'promoted', 'archived')
  ),
  assigned_to_member_id TEXT NULL REFERENCES public.team_members(member_id) ON DELETE SET NULL,
  promoted_brand_id TEXT NULL REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. WhatsApp outbound & inbound message log
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  member_id TEXT NULL REFERENCES public.team_members(member_id) ON DELETE SET NULL,
  phone_e164 TEXT NOT NULL,
  message_body TEXT NOT NULL,
  related_task_id UUID NULL REFERENCES public.tasks(id) ON DELETE SET NULL,
  provider_status TEXT NOT NULL DEFAULT 'simulated',
  idempotency_key TEXT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
