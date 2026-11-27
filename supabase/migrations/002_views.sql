-- Phase 1.1: Single-source-of-truth SQL views for Dashboard (Measure) and Copilot (Diagnose)
-- All current-state views select the latest version per entity (ordered by effective_at DESC, history_id DESC)
-- to prevent duplicate counting or future-state leakage.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Latest qualification state per brand
CREATE OR REPLACE VIEW public.v_latest_brand_qualification AS
SELECT DISTINCT ON (brand_id)
  history_id,
  brand_id,
  brand_name,
  qualification_status,
  reason,
  sponsor_campaign_id,
  source_campaign_name,
  effective_at
FROM public.brand_qualification
ORDER BY brand_id, effective_at DESC, history_id DESC;

-- Latest opportunity stage & values per opportunity
CREATE OR REPLACE VIEW public.v_latest_opportunity_state AS
SELECT DISTINCT ON (oh.opportunity_id)
  oh.history_id,
  oh.opportunity_id,
  oh.opportunity_name,
  oh.brand_id,
  oh.brand_name,
  po.sponsor_campaign_id,
  po.originating_campaign_name,
  po.support_type,
  po.primary_contact_id,
  po.primary_contact_name,
  oh.stage,
  oh.proposed_value_inr,
  oh.confirmed_value_inr,
  oh.collected_value_inr,
  oh.owner_id,
  oh.owner_name,
  oh.effective_at
FROM public.opportunity_history oh
JOIN public.partner_opportunities po
  ON po.opportunity_id = oh.opportunity_id
ORDER BY oh.opportunity_id, oh.effective_at DESC, oh.history_id DESC;

-- Latest target version
CREATE OR REPLACE VIEW public.v_latest_target AS
SELECT
  target_version,
  effective_at,
  qualified_brands_goal,
  confirmed_partnerships_goal
FROM public.targets
ORDER BY effective_at DESC
LIMIT 1;

-- 1. Funnel counts (distinct brands per population — never conflated)
CREATE OR REPLACE VIEW public.v_funnel AS
SELECT
  (SELECT COUNT(DISTINCT brand_id)::INT FROM public.brands) AS researched_brands,
  (SELECT COUNT(DISTINCT brand_id)::INT
     FROM public.sponsor_interactions
     WHERE event_type = 'outreach_sent') AS outreach_sent_brands,
  (SELECT COUNT(DISTINCT brand_id)::INT
     FROM public.v_latest_brand_qualification
     WHERE qualification_status IN ('engaged', 'qualified')) AS engaged_or_qualified_brands,
  (SELECT COUNT(DISTINCT brand_id)::INT
     FROM public.sponsor_interactions
     WHERE event_type = 'meeting_held') AS meeting_held_brands,
  (SELECT COUNT(DISTINCT brand_id)::INT
     FROM public.v_latest_brand_qualification
     WHERE qualification_status = 'qualified') AS qualified_brands,
  (SELECT COUNT(DISTINCT brand_id)::INT
     FROM public.partner_opportunities) AS opportunity_brands,
  (SELECT COUNT(DISTINCT brand_id)::INT
     FROM public.v_latest_opportunity_state
     WHERE stage = 'partner_confirmed') AS confirmed_brands;

-- 2. Deal economics & cash summary (confirmed vs proposed vs withdrawn/lost vs collected)
CREATE OR REPLACE VIEW public.v_cash AS
SELECT
  COUNT(*) FILTER (WHERE stage = 'partner_confirmed')::INT AS confirmed_count,
  COALESCE(SUM(confirmed_value_inr) FILTER (WHERE stage = 'partner_confirmed'), 0)::BIGINT AS confirmed_value_inr,
  COALESCE(SUM(collected_value_inr) FILTER (WHERE stage = 'partner_confirmed'), 0)::BIGINT AS collected_value_inr,
  COALESCE(ROUND(AVG(confirmed_value_inr) FILTER (WHERE stage = 'partner_confirmed')), 0)::BIGINT AS avg_confirmed_deal_inr,
  COUNT(*) FILTER (WHERE stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating'))::INT AS open_count,
  COALESCE(SUM(proposed_value_inr) FILTER (WHERE stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating')), 0)::BIGINT AS open_pipeline_inr,
  COUNT(*) FILTER (WHERE stage = 'withdrawn')::INT AS withdrawn_count,
  COALESCE(SUM(proposed_value_inr) FILTER (WHERE stage = 'withdrawn'), 0)::BIGINT AS withdrawn_value_inr,
  COUNT(*) FILTER (WHERE stage = 'lost')::INT AS lost_count,
  COALESCE(SUM(proposed_value_inr) FILTER (WHERE stage = 'lost'), 0)::BIGINT AS lost_value_inr
FROM public.v_latest_opportunity_state;

-- 3. Campaign / channel efficiency table (attribution by originating campaign)
CREATE OR REPLACE VIEW public.v_campaign_perf AS
WITH interaction_stats AS (
  SELECT
    sponsor_campaign_id,
    COUNT(*)::INT AS interactions,
    COUNT(DISTINCT brand_id)::INT AS brands_reached,
    COUNT(DISTINCT brand_id) FILTER (WHERE event_type = 'meeting_held')::INT AS meetings_held_brands
  FROM public.sponsor_interactions
  GROUP BY sponsor_campaign_id
),
opp_stats AS (
  SELECT
    sponsor_campaign_id,
    COUNT(*)::INT AS opportunities_created,
    COUNT(*) FILTER (WHERE stage = 'partner_confirmed')::INT AS confirmed_deals,
    COALESCE(SUM(confirmed_value_inr) FILTER (WHERE stage = 'partner_confirmed'), 0)::BIGINT AS confirmed_value_inr,
    COUNT(*) FILTER (WHERE stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating'))::INT AS open_deals,
    COALESCE(SUM(proposed_value_inr) FILTER (WHERE stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating')), 0)::BIGINT AS open_pipeline_inr
  FROM public.v_latest_opportunity_state
  GROUP BY sponsor_campaign_id
)
SELECT
  sc.sponsor_campaign_id,
  sc.campaign_name,
  sc.channel,
  sc.owner_name,
  COALESCE(i.interactions, 0) AS interactions,
  COALESCE(i.brands_reached, 0) AS brands_reached,
  COALESCE(i.meetings_held_brands, 0) AS meetings_held_brands,
  COALESCE(o.opportunities_created, 0) AS opportunities_created,
  COALESCE(o.confirmed_deals, 0) AS confirmed_deals,
  COALESCE(o.confirmed_value_inr, 0) AS confirmed_value_inr,
  COALESCE(o.open_deals, 0) AS open_deals,
  COALESCE(o.open_pipeline_inr, 0) AS open_pipeline_inr,
  CASE
    WHEN COALESCE(i.interactions, 0) = 0 THEN 0
    ELSE ROUND(COALESCE(o.confirmed_value_inr, 0)::NUMERIC / i.interactions)::BIGINT
  END AS inr_per_interaction
FROM public.sponsor_campaigns sc
LEFT JOIN interaction_stats i ON i.sponsor_campaign_id = sc.sponsor_campaign_id
LEFT JOIN opp_stats o ON o.sponsor_campaign_id = sc.sponsor_campaign_id
ORDER BY confirmed_value_inr DESC, open_pipeline_inr DESC, interactions DESC;

-- 4. Targets vs actuals (all target versions compared with current actuals)
CREATE OR REPLACE VIEW public.v_targets_vs_actuals AS
SELECT
  t.target_version,
  t.effective_at,
  t.qualified_brands_goal,
  t.confirmed_partnerships_goal,
  f.qualified_brands AS actual_qualified_brands,
  c.confirmed_count AS actual_confirmed_partnerships,
  (f.qualified_brands - t.qualified_brands_goal) AS qualified_variance,
  (c.confirmed_count - t.confirmed_partnerships_goal) AS confirmed_variance,
  (t.target_version = (SELECT target_version FROM public.v_latest_target)) AS is_latest
FROM public.targets t
CROSS JOIN public.v_funnel f
CROSS JOIN public.v_cash c
ORDER BY t.effective_at DESC;

-- 5. Bottlenecks: open opportunities ranked by age since last stage update
CREATE OR REPLACE VIEW public.v_bottlenecks AS
WITH ref_date AS (
  SELECT GREATEST(
    COALESCE((SELECT MAX(effective_at) FROM public.opportunity_history), NOW()),
    (SELECT history_end::TIMESTAMPTZ FROM public.event LIMIT 1)
  ) AS anchor_ts
)
SELECT
  o.opportunity_id,
  o.opportunity_name,
  o.brand_id,
  o.brand_name,
  o.stage,
  o.proposed_value_inr,
  o.originating_campaign_name,
  o.owner_name,
  o.effective_at,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (r.anchor_ts - o.effective_at)) / 86400))::INT AS days_in_stage
FROM public.v_latest_opportunity_state o
CROSS JOIN ref_date r
WHERE o.stage IN ('prospecting', 'contacted', 'proposal_sent', 'negotiating')
ORDER BY days_in_stage DESC, o.proposed_value_inr DESC;

COMMIT;
