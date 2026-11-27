-- Phase E1: v2 Planning, Cash vs In-Kind Split, Workforce Workload & Event Packages

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Extend tasks with priority, category, and optional package link
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'p1' CHECK (priority IN ('p0', 'p1', 'p2')),
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'closing' CHECK (
    category IN ('outreach', 'closing', 'collection', 'event_ops', 'creative_assets')
  ),
  ADD COLUMN IF NOT EXISTS package_id TEXT NULL;

-- 2. Event packages (IIT-inspired sponsorable inventory)
CREATE TABLE IF NOT EXISTS public.event_packages (
  package_id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  iit_inspiration TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('title', 'powered_by', 'category_zone', 'activation_booth')),
  target_industry TEXT NOT NULL,
  list_price_inr BIGINT NOT NULL CHECK (list_price_inr >= 0),
  slots_total INTEGER NOT NULL DEFAULT 1 CHECK (slots_total >= 1),
  event_day TEXT NOT NULL DEFAULT 'both' CHECK (event_day IN ('day_1', 'day_2', 'both')),
  opportunity_id TEXT NULL REFERENCES public.partner_opportunities(opportunity_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'delivered')),
  deliverables_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Event milestones (anchored to CampusFest 2025: 12-13 Apr 2025)
CREATE TABLE IF NOT EXISTS public.event_milestones (
  milestone_id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  offset_days INTEGER NOT NULL,
  due_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('pipeline', 'packaging', 'collection', 'event_ops', 'settlement')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Cash vs In-Kind breakdown view (single source of truth)
CREATE OR REPLACE VIEW public.v_cash_breakdown AS
SELECT
  COUNT(*) FILTER (WHERE stage = 'partner_confirmed' AND support_type = 'cash')::INT AS confirmed_cash_count,
  COALESCE(SUM(confirmed_value_inr) FILTER (WHERE stage = 'partner_confirmed' AND support_type = 'cash'), 0)::BIGINT AS confirmed_cash_inr,
  COUNT(*) FILTER (WHERE stage = 'partner_confirmed' AND support_type = 'in_kind')::INT AS confirmed_in_kind_count,
  COALESCE(SUM(confirmed_value_inr) FILTER (WHERE stage = 'partner_confirmed' AND support_type = 'in_kind'), 0)::BIGINT AS confirmed_in_kind_inr,
  COALESCE(SUM(collected_value_inr) FILTER (WHERE stage = 'partner_confirmed' AND support_type = 'cash'), 0)::BIGINT AS collected_cash_inr,
  COALESCE(SUM(proposed_value_inr) FILTER (WHERE stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating')), 0)::BIGINT AS open_pipeline_inr
FROM public.v_latest_opportunity_state;

-- 5. Industry performance view
CREATE OR REPLACE VIEW public.v_industry_perf AS
SELECT
  b.industry,
  COUNT(DISTINCT b.brand_id)::INT AS total_brands,
  COUNT(DISTINCT o.opportunity_id) FILTER (WHERE o.stage = 'partner_confirmed')::INT AS confirmed_deals,
  COALESCE(SUM(o.confirmed_value_inr) FILTER (WHERE o.stage = 'partner_confirmed'), 0)::BIGINT AS confirmed_value_inr,
  COUNT(DISTINCT o.opportunity_id) FILTER (WHERE o.stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating'))::INT AS open_deals,
  COALESCE(SUM(o.proposed_value_inr) FILTER (WHERE o.stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating')), 0)::BIGINT AS open_pipeline_inr
FROM public.brands b
LEFT JOIN public.v_latest_opportunity_state o ON o.brand_id = b.brand_id
GROUP BY b.industry
ORDER BY confirmed_value_inr DESC, open_pipeline_inr DESC;

-- 6. Owner workload view (workforce capacity & ROI per team member)
CREATE OR REPLACE VIEW public.v_owner_workload AS
WITH all_owners AS (
  SELECT owner_id, owner_name FROM public.brands
  UNION
  SELECT owner_id, owner_name FROM public.sponsor_campaigns
  UNION
  SELECT owner_id, owner_name FROM public.v_latest_opportunity_state
),
brand_counts AS (
  SELECT owner_id, COUNT(*)::INT AS brands_owned FROM public.brands GROUP BY owner_id
),
interaction_counts AS (
  SELECT
    owner_id,
    COUNT(*)::INT AS interactions_count,
    COUNT(*) FILTER (WHERE channel = 'email')::INT AS email_interactions_count
  FROM public.sponsor_interactions
  GROUP BY owner_id
),
opp_counts AS (
  SELECT
    owner_id,
    COUNT(*) FILTER (WHERE stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating'))::INT AS open_opps_count,
    COALESCE(SUM(proposed_value_inr) FILTER (WHERE stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating')), 0)::BIGINT AS open_pipeline_inr,
    COUNT(*) FILTER (WHERE stage = 'partner_confirmed')::INT AS confirmed_deals_count,
    COALESCE(SUM(confirmed_value_inr) FILTER (WHERE stage = 'partner_confirmed'), 0)::BIGINT AS confirmed_value_inr,
    COALESCE(SUM(collected_value_inr) FILTER (WHERE stage = 'partner_confirmed'), 0)::BIGINT AS collected_value_inr
  FROM public.v_latest_opportunity_state
  GROUP BY owner_id
),
task_counts AS (
  SELECT
    owner_name,
    COUNT(*) FILTER (WHERE status <> 'done')::INT AS open_tasks_count,
    COUNT(*) FILTER (WHERE status <> 'done' AND due_date IS NOT NULL AND due_date < CURRENT_DATE)::INT AS overdue_tasks_count
  FROM public.tasks
  GROUP BY owner_name
)
SELECT
  ao.owner_id,
  ao.owner_name,
  COALESCE(bc.brands_owned, 0) AS brands_owned,
  COALESCE(ic.interactions_count, 0) AS interactions_count,
  COALESCE(ic.email_interactions_count, 0) AS email_interactions_count,
  COALESCE(oc.open_opps_count, 0) AS open_opps_count,
  COALESCE(oc.open_pipeline_inr, 0) AS open_pipeline_inr,
  COALESCE(oc.confirmed_deals_count, 0) AS confirmed_deals_count,
  COALESCE(oc.confirmed_value_inr, 0) AS confirmed_value_inr,
  COALESCE(oc.collected_value_inr, 0) AS collected_value_inr,
  COALESCE(tc.open_tasks_count, 0) AS open_tasks_count,
  COALESCE(tc.overdue_tasks_count, 0) AS overdue_tasks_count
FROM all_owners ao
LEFT JOIN brand_counts bc ON bc.owner_id = ao.owner_id
LEFT JOIN interaction_counts ic ON ic.owner_id = ao.owner_id
LEFT JOIN opp_counts oc ON oc.owner_id = ao.owner_id
LEFT JOIN task_counts tc ON tc.owner_name = ao.owner_name
ORDER BY confirmed_value_inr DESC, interactions_count DESC;

COMMIT;
