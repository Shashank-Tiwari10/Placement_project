# CampusFest 2025 — Sponsorship Growth Center (RISA Challenge B)

**Author:** Shashank Tiwari  
**Case:** CampusFest 2025 (Delhi Tier-1) — Maximise **sponsorship cash confirmed and collected before the event (`12–13 April 2025`)**  
**Stack:** Next.js `16.4.6` (App Router, TypeScript, Tailwind CSS) · Supabase Postgres · Gemini `3.5-flash-lite` (`@google/genai`) · Twilio / Local WhatsApp Simulator

---

## 1. Executive Summary

The **Sponsorship Growth Center** combines a live SQL-backed analytics dashboard, append-only pipeline & workforce management, IIT-inspired experiential event packaging, per-event target prospecting, WhatsApp task notifications/chatbot, and a **deterministically grounded AI Copilot** inside one workspace.

**Core Design Rule (Determinism Boundary):** The LLM never performs arithmetic or invents metrics. Every KPI, funnel count, rupee total, workforce load, and target comparison is computed in Postgres views (`002_views.sql`, `003_v2_planning.sql`) and shared TypeScript modules (`src/lib/analytics.ts`), while Gemini only selects tools and narrates verified JSON outputs.

---

## 2. Data Sources & Rigor Traps Handled

All historical metrics are derived from `data/Sponsor_Dataset.xlsx` (12 sheets covering `15 January – 20 April 2025` in `Asia/Kolkata +05:30`).

| Trap in Source Data | How This System Solves It |
|---|---|
| **Full-state versioned histories** | `v_latest_brand_qualification` and `v_latest_opportunity_state` use `DISTINCT ON ... ORDER BY effective_at DESC, history_id DESC`. Point-in-time `As-Of` queries filter `<= YYYY-MM-DD 23:59:59.999+05:30` to prevent future leakage. |
| **Duplicate import-retry rows** | `scripts/seed.ts` (`src/lib/etl.ts`) deduplicates by stable source ID: `Sponsor interactions` (`953 → 950`), `Brand qualification` (`434 → 433`), and `Opportunity history` (`230 → 228`). |
| **Distinct brand populations** | Outreach attempts ≠ contacts ≠ engaged/responded (`88`) ≠ qualified (`60`) ≠ confirmed (`24`). `v_funnel` counts distinct `brand_id` per stage. |
| **Proposed vs. Confirmed vs. Cash vs. In-Kind** | `v_cash_breakdown` separates **confirmed cash** (`₹20,00,000` / `20` deals), **confirmed in-kind barter** (`₹2,40,000` / `4` deals), **active open pipeline** (`₹14,40,000` / `26` deals), **withdrawn** (`₹80,000` / `1` deal), **lost** (`₹7,80,000` / `7` deals), and **collected pre-event** (`collected_value_inr`). |
| **Association ≠ Causation** | `Sponsor activations` (`Beardo`, `Mosaic Mobility`, `Maple Devices`) link deals to attendee campaigns observationally. Both `/`, `/events`, and the Copilot explicitly refuse causal attendance uplift claims. |

---

## 3. Verified Baseline Calculations (`[data]`)

### 3.1 Funnel & Economics
- **Funnel (Distinct Brands):** `180` Researched → `141` Outreach sent (`78.3%`) → `88` Engaged or qualified (`48.9%`) → `60` Meeting held (`33.3%`) → `60` Qualified (`42.6%` of outreach) → `57` Opportunity created → **`24` Partner confirmed** (`40.0%` of qualified, `13.3%` overall).
- **Targets vs. Actuals (`Sponsor revised plan`, 15 Mar 2025):**
  - Qualified Brands: **`60` actual vs `55` goal** (`+5` beat)
  - Confirmed Partnerships: **`24` actual vs `28` goal** (`-4` gap)
- **Deal Economics:**
  - Total Confirmed Value: `₹22,40,000` (`24` deals, avg `₹93,333`)
  - **Confirmed Cash:** **`₹20,00,000`** (`20` cash deals, avg `₹1,00,000`)
  - **Confirmed In-Kind:** **`₹2,40,000`** (`4` deals: `Harbor Beverages` ₹1.00L, `Bramble Threads` ₹0.60L, `Bramble Wellness` ₹0.45L, `Bramble Collective` ₹0.35L)
  - **Active Open Pipeline:** **`₹14,40,000`** (`26` deals across `prospecting`, `contacted`, `proposal_sent`, `negotiating`)
  - **Withdrawn / Lost:** `1` withdrawn (`O006` Cobalt Learning, `₹80,000`) + `7` lost (`₹7,80,000`)

### 3.2 Channel Efficiency (Originating Attribution)
| Campaign | Channel | Interactions | Brands | Confirmed Deals | Confirmed ₹ | Verdict |
|---|---|---:|---:|---:|---:|---|
| Warm Partner Introductions (`SC02`) | `introduction` | 34 | 8 | **8** | **₹7.85L** | **Double down** |
| Creator Network Referrals (`SC05`) | `introduction` | 72 | 19 | **9** | **₹7.85L** | **Double down** |
| Partner Interest Form (`SC04`) | `web_inbound` | 62 | 17 | **7** | **₹6.70L** | **Invest** |
| Brand Leader LinkedIn (`SC03`) | `linkedin` | 161 | 37 | 0 | ₹0 | Monitor (open pipeline) |
| Past Conversation Revival (`SC06`) | `email` | 114 | 20 | 0 | ₹0 | Deprioritise |
| Brand Discovery Email (`SC01`) | `email` | 507 | 91 | **0** | **₹0** | **Kill / Cut** |

**Headline Diagnosis:** 3 high-trust channels (`SC02`, `SC05`, `SC04`) produced **100% of confirmed value** on `168` interactions, while 2 email motions (`SC01`, `SC06`) produced **`₹0` on `621` interactions**.

### 3.3 Workforce Skew & Industry Concentration
- **Workforce (`4` active owners):** `Kabir Shah (T02)` holds `126/180` brands (`70%`) and `683/950` interactions (`71.9%`, including `621` email touches) with `0` closing ownership, while `Riya Kapoor (T01)` (`10` confirmed `₹10.75L`, `10` open `₹6.00L`), `Nisha Rao (T05)` (`9` confirmed `₹7.25L`, `8` open `₹4.20L`), and `Meera Iyer (T03)` (`5` confirmed `₹4.40L`, `8` open `₹4.20L`) carry `26` unclosed deals.
- **Industry Open Pipeline:** `Consumer products` (`₹6.50L` across `7` open deals) and `Education` (`₹4.00L` across `7` open deals) represent **`72.9%` (`₹10.50L`) of all active open pipeline**.

---

## 4. Research, Assumptions & Prioritisation Framework (ICE)

### 4.1 Ambition Model (`[data]` vs `[assumption]` vs `[benchmark]`)
- **Base Case `[assumption]`:** Reallocate effort from dead cold-email channels to `SC02`/`SC05`/`SC04` and close existing open pipeline → **`30–32` confirmed deals (`₹30–33L`)**.
- **Stretch Case `[assumption]` + `[benchmark]`:** Package CampusFest inventory using IIT fest experiential tiers (Title / Powered-By / Category Zone) to lift average deal size and close rate (~50%) + enforce pre-event cash collection → **`38–42` confirmed deals (`₹45–55L`)**.

### 4.2 IIT Fest Activation Research → CampusFest Mapping
| IIT Benchmark `[benchmark]` | Experiential Format | CampusFest Vertical & Package |
|---|---|---|
| **IIT Bombay (Mood Indigo)** | Themed Zone Takeovers & Creator Lounges | `Personal care` + `Consumer products` → *Themed Creator & Grooming Lounge* (`₹2.0L`) |
| **IIT Delhi (Rendezvous)** | EV/Auto Stunt & Test-Drive Tracks | `Mobility` (`₹1.5L` open) → *EV / Mobility Test-Drive & Stunt Track* (`₹1.75L`) |
| **IIT Madras (Saarang/Shaastra) & IITB (Techfest)** | Reverse-Brief Hackathons & Case Quizzing | `Education` (`₹4.0L` open, lagging close rate) → *Reverse-Brief Case & Hackathon* (`₹1.5L`) |
| **IIT Kharagpur (Spring Fest)** | Zero-Waste Refill & Entry-Kit Sampling | `Food and beverage` (`₹2.4L` open) → *Zero-Waste Refill & Sampling Zone* (`₹1.25L`) |
| **IIT Kanpur (Antaragni)** | Creator Spotlight, Podcast & QR Quiz Stage | `Media` + `Consumer products` → *Creator Spotlight & Podcast Stage* (`₹1.5L`) |

### 4.3 Ranked Bets (ICE + Painkiller/Vitamin)
1. **Double down on Warm Intros (`SC02`) + Creator Referrals (`SC05`)** — *Painkiller · ICE: High* (`17` confirmed on `27` brands; `+6–10` confirmed).
2. **Close the `₹14.4L` active open pipeline (`26` deals) with IIT-style Education/Consumer packages** — *Painkiller · ICE: High* (`+₹8–12L` collected).
3. **Scale Inbound Partner Interest Form (`SC04`)** — *ICE: Med-High* (`7/17` confirmed; `+3–5` confirmed).
4. **Enforce 50% advance + 100% pre-event cash settlement checklists (`T-14` / `T-7`)** — *ICE: Med* (moves cash left on calendar before `12 Apr`).
5. **Kill / deprioritise cold Brand Discovery Email (`SC01`)** — *Explicit Kill* (`507` interactions, `0` confirmed; frees Kabir Shah's capacity).

---

## 5. Product Surfaces & Architecture

- **`/` (Measure):** Funnel, cash vs. in-kind split, `As-Of` IST snapshot selector, target version toggle, 6-campaign efficiency table, industry pools, bottlenecks, and observational activations.
- **`/pipeline` (Manage Deals):** Filterable 58-deal board with **append-only history** (`opportunity_history` inserts) and audit-trail inspection.
- **`/targets` (Per-Event Target Companies):** `14` external prospect companies mapped to the 5 IIT-style event packages (isolated from historical 180 brands), with 1-click **Promote to Pipeline**.
- **`/events` (Event Planning & Readiness):** `T-60 → T+7` pre-event milestone timeline + 5 IIT-inspired packages with 1-click **Attach & Spawn 4-Task Checklist**.
- **`/workforce` (Capacity & Rebalancing):** Owner workload matrix (`v_owner_workload`) + 1-click open-deal owner reassignment.
- **`/campaigns` (Acquisition Motions):** View performance & launch new campaigns.
- **`/tasks` (Execution Queue):** `P0/P1/P2` priorities, categories, owner filter, and 1-click deal checklist generator.
- **`/whatsapp` (WhatsApp Workflow & Bot):** Outbound task/assignment notifications + inbound webhook (`POST /api/whatsapp/webhook`) using Twilio Sandbox or Local Simulator.
- **Embedded AI Copilot (`CopilotDrawer`):** Powered by `gemini-3.5-flash-lite` (`src/lib/analyst-engine.ts`), 15 deterministic read tools, 5 confirm-gated write tools, Markdown table rendering (`react-markdown` + `remark-gfm`), and role-scoped access.

### 3-Tier Hierarchical RBAC (`Heads` → `Managers` → `Coordinators`)
Enforced server-side via signed HTTP-only cookies (`src/lib/auth.ts` → `requirePrincipal()`):
- **Head (`Aarav Mehta`, PIN `1111`):** Full read/write across all surfaces, financials, workforce, campaigns, and Copilot tools.
- **Manager (`Riya Kapoor` `2222`, `Nisha Rao` `3333`):** Pipeline stages, package reservations, target promotion, task assignment, team Copilot.
- **Coordinator (`Meera Iyer` `4444`, `Kabir Shah` `5555`):** Scoped to own assigned tasks, assigned target call list, and assigned deals; blocked (`HTTP 403`) from `/api/metrics`, `/api/workforce`, org-wide Copilot financial tools, and WhatsApp org-cash queries.

---

## 6. Setup & Deployment

### Prerequisites
- Node.js `20+` (tested on `v24.19.0`)
- Supabase project (Postgres)
- Google AI Studio API key (`GEMINI_API_KEY`)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure `.env.local`
Copy `.env.example` to `.env.local` and set:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-or-sb-secret-key
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.5-flash-lite
SESSION_SECRET=replace-with-random-32-char-secret
ENABLE_DEMO_ROLE_SWITCHER=true
```
*(Optional for live WhatsApp via Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.)*

### 3. Run Supabase SQL Migrations (in SQL Editor, in order)
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_views.sql`
3. `supabase/migrations/003_v2_planning.sql`
4. `supabase/migrations/004_v3_rbac_targets_whatsapp.sql`

### 4. Seed & Verify
```bash
npm run seed:dry   # Local ETL + self-test without DB writes
npm run seed       # Upserts all 14 tables to Supabase & verifies row counts
npm run dev        # Starts http://localhost:3000
```

### 5. Deploy to Vercel
Push the repo to GitHub, import into Vercel, add the `.env.local` variables under **Project Settings → Environment Variables**, and deploy. Verify `/api/health` returns `{"ok": true, "brandsCount": 180}`.

---

## 7. Limitations
- **Synthetic Historical Dataset:** All 180 brands, contacts, and interactions in `Sponsor_Dataset.xlsx` are synthetic; IIT fest tiering is `[benchmark]` context only.
- **No Causal Attendance Uplift Data:** `Sponsor activations` records observational links only; the dataset lacks control groups or incremental visitor counts.
- **Historical Bank Receipts (`collected_value_inr`):** Starts at `0` for historical rows because the source dataset tracks committed value, not bank settlement; pre-event collections are updated via `/pipeline` or the Copilot.
- **Demo Authentication:** Uses signed PIN/role-switcher cookies (`team_members`) rather than full OAuth/SSO; disable `ENABLE_DEMO_ROLE_SWITCHER=false` for strict PIN-only login.
