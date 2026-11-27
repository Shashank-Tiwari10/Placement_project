-- Phase 0.2: Raw immutable tables + execution tasks table
-- Tier-1 Decisions:
--   1. Single-tenant demo workspace (no auth/RLS complexity for Phase 0; server-only service key).
--   2. Stable source IDs as Primary Keys (brand_id, contact_id, interaction_id, history_id, etc.).
--   3. Event-sourced histories preserved immutably; edits append new history rows.
--   4. Money stored as BIGINT whole INR (never float).
--   5. Timestamps stored as TIMESTAMPTZ in UTC (converted from Asia/Kolkata +05:30).

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Event metadata
CREATE TABLE IF NOT EXISTS public.event (
  event_name TEXT PRIMARY KEY,
  history_start DATE NOT NULL,
  history_end DATE NOT NULL,
  event_starts_at TIMESTAMPTZ NOT NULL,
  event_ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  fictional BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Versioned targets (full-state snapshots)
CREATE TABLE IF NOT EXISTS public.targets (
  target_version TEXT PRIMARY KEY,
  effective_at TIMESTAMPTZ NOT NULL,
  qualified_brands_goal INTEGER NOT NULL CHECK (qualified_brands_goal >= 0),
  confirmed_partnerships_goal INTEGER NOT NULL CHECK (confirmed_partnerships_goal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Brands (target universe)
CREATE TABLE IF NOT EXISTS public.brands (
  brand_id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- 4. Sponsor contacts
CREATE TABLE IF NOT EXISTS public.sponsor_contacts (
  contact_id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES public.brands(brand_id) ON DELETE RESTRICT,
  brand_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- 5. Sponsor campaigns (acquisition motions)
CREATE TABLE IF NOT EXISTS public.sponsor_campaigns (
  sponsor_campaign_id TEXT PRIMARY KEY,
  campaign_name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin', 'introduction', 'web_inbound')),
  objective TEXT NOT NULL,
  audience TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  planned_start_at TIMESTAMPTZ NOT NULL,
  planned_end_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- 6. Sponsor interactions (deduplicated event log)
CREATE TABLE IF NOT EXISTS public.sponsor_interactions (
  interaction_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  origin_interaction_id TEXT NULL,
  brand_id TEXT NOT NULL REFERENCES public.brands(brand_id) ON DELETE RESTRICT,
  brand_name TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES public.sponsor_contacts(contact_id) ON DELETE RESTRICT,
  contact_name TEXT NOT NULL,
  sponsor_campaign_id TEXT NOT NULL REFERENCES public.sponsor_campaigns(sponsor_campaign_id) ON DELETE RESTRICT,
  campaign_name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin', 'introduction', 'web_inbound')),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'outreach_sent',
      'delivered',
      'replied',
      'meeting_booked',
      'meeting_held',
      'opt_out',
      'introduction_received',
      'web_inbound'
    )
  ),
  outcome TEXT NOT NULL,
  summary TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interactions_brand_occurred
  ON public.sponsor_interactions (brand_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_interactions_campaign
  ON public.sponsor_interactions (sponsor_campaign_id, occurred_at);

-- 7. Brand qualification history (append-only full-state versions)
CREATE TABLE IF NOT EXISTS public.brand_qualification (
  history_id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES public.brands(brand_id) ON DELETE RESTRICT,
  brand_name TEXT NOT NULL,
  qualification_status TEXT NOT NULL CHECK (
    qualification_status IN ('unreviewed', 'engaged', 'qualified', 'unqualified', 'dormant')
  ),
  reason TEXT NOT NULL,
  sponsor_campaign_id TEXT NULL REFERENCES public.sponsor_campaigns(sponsor_campaign_id) ON DELETE RESTRICT,
  source_campaign_name TEXT NULL,
  effective_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brand_qual_brand_effective
  ON public.brand_qualification (brand_id, effective_at DESC);

-- 8. Partner opportunities (entity header)
CREATE TABLE IF NOT EXISTS public.partner_opportunities (
  opportunity_id TEXT PRIMARY KEY,
  opportunity_name TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES public.brands(brand_id) ON DELETE RESTRICT,
  brand_name TEXT NOT NULL,
  primary_contact_id TEXT NOT NULL REFERENCES public.sponsor_contacts(contact_id) ON DELETE RESTRICT,
  primary_contact_name TEXT NOT NULL,
  sponsor_campaign_id TEXT NOT NULL REFERENCES public.sponsor_campaigns(sponsor_campaign_id) ON DELETE RESTRICT,
  originating_campaign_name TEXT NOT NULL,
  support_type TEXT NOT NULL CHECK (support_type IN ('cash', 'in_kind')),
  created_at TIMESTAMPTZ NOT NULL
);

-- 9. Opportunity history (append-only full-state versions)
-- Note: collected_value_inr defaults to 0 for historical rows (dataset tracks confirmed value, not bank receipt).
CREATE TABLE IF NOT EXISTS public.opportunity_history (
  history_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES public.partner_opportunities(opportunity_id) ON DELETE RESTRICT,
  opportunity_name TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES public.brands(brand_id) ON DELETE RESTRICT,
  brand_name TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (
    stage IN (
      'prospecting',
      'contacted',
      'proposal_sent',
      'negotiating',
      'partner_confirmed',
      'lost',
      'withdrawn'
    )
  ),
  proposed_value_inr BIGINT NOT NULL DEFAULT 0 CHECK (proposed_value_inr >= 0),
  confirmed_value_inr BIGINT NOT NULL DEFAULT 0 CHECK (confirmed_value_inr >= 0),
  collected_value_inr BIGINT NOT NULL DEFAULT 0 CHECK (collected_value_inr >= 0),
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opp_history_opp_effective
  ON public.opportunity_history (opportunity_id, effective_at DESC);

-- 10. Sponsor activations (observational associations only — NOT causal uplift)
CREATE TABLE IF NOT EXISTS public.sponsor_activations (
  activation_id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES public.brands(brand_id) ON DELETE RESTRICT,
  brand_name TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES public.partner_opportunities(opportunity_id) ON DELETE RESTRICT,
  opportunity_name TEXT NOT NULL,
  attendee_campaign_id TEXT NOT NULL,
  attendee_campaign_name TEXT NOT NULL,
  activation_note TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL
);

-- 11. Tasks (execution layer for Phase 2 Manage + Phase 3 Copilot writes)
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL,
  due_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  brand_id TEXT NULL REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  sponsor_campaign_id TEXT NULL REFERENCES public.sponsor_campaigns(sponsor_campaign_id) ON DELETE SET NULL,
  opportunity_id TEXT NULL REFERENCES public.partner_opportunities(opportunity_id) ON DELETE SET NULL,
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'copilot')),
  idempotency_key TEXT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
