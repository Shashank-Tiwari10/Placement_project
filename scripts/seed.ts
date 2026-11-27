import path from 'node:path';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseWorkbook, runSelfTest } from '../src/lib/etl.ts';
import { DEFAULT_EVENT_MILESTONES, DEFAULT_EVENT_PACKAGES } from '../src/lib/v2-defaults.ts';
import { DEFAULT_TARGET_COMPANIES, DEFAULT_TEAM_MEMBERS } from '../src/lib/v3-defaults.ts';

function loadEnvLocal(repoRoot: string) {
  const envPath = path.join(repoRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  const repoRoot = process.cwd();
  loadEnvLocal(repoRoot);

  const isDryRun = process.argv.includes('--dry-run');
  const xlsxPath = path.join(repoRoot, 'data', 'Sponsor_Dataset.xlsx');

  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`Dataset not found at ${xlsxPath}`);
  }

  console.log(`Parsing workbook: ${xlsxPath}`);
  const parsed = parseWorkbook(xlsxPath);

  console.log('Running Phase 0.3 ETL self-test...');
  const report = runSelfTest(parsed);

  console.log('\n=== ETL SELF-TEST SUMMARY ===');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('\nDedup stats:', parsed.stats);

  if (!report.passed) {
    console.error('\nSELF-TEST FAILED:');
    for (const f of report.failures) console.error(' -', f);
    process.exit(1);
  }
  console.log('\nSELF-TEST PASSED: All Phase 0.3 tie-outs verified!');

  if (isDryRun) {
    console.log('\n--dry-run flag set: skipping Supabase upload.');
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || supabaseUrl.includes('your-project-ref')) {
    console.error(
      '\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.\n' +
        'Run with --dry-run to verify locally, or add credentials to .env.local and re-run.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const steps: Array<{ table: string; conflict: string; rows: unknown[] }> = [
    { table: 'event', conflict: 'event_name', rows: parsed.event },
    { table: 'targets', conflict: 'target_version', rows: parsed.targets },
    { table: 'brands', conflict: 'brand_id', rows: parsed.brands },
    { table: 'sponsor_contacts', conflict: 'contact_id', rows: parsed.sponsor_contacts },
    { table: 'sponsor_campaigns', conflict: 'sponsor_campaign_id', rows: parsed.sponsor_campaigns },
    { table: 'sponsor_interactions', conflict: 'interaction_id', rows: parsed.sponsor_interactions },
    { table: 'brand_qualification', conflict: 'history_id', rows: parsed.brand_qualification },
    { table: 'partner_opportunities', conflict: 'opportunity_id', rows: parsed.partner_opportunities },
    { table: 'opportunity_history', conflict: 'history_id', rows: parsed.opportunity_history },
    { table: 'sponsor_activations', conflict: 'activation_id', rows: parsed.sponsor_activations },
    { table: 'event_packages', conflict: 'package_id', rows: DEFAULT_EVENT_PACKAGES },
    { table: 'event_milestones', conflict: 'milestone_id', rows: DEFAULT_EVENT_MILESTONES },
    { table: 'team_members', conflict: 'member_id', rows: DEFAULT_TEAM_MEMBERS },
    { table: 'target_companies', conflict: 'target_id', rows: DEFAULT_TARGET_COMPANIES },
  ];

  for (const step of steps) {
    // Batch upserts in chunks of 250 to avoid payload limits
    const chunkSize = 250;
    for (let i = 0; i < step.rows.length; i += chunkSize) {
      const chunk = step.rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from(step.table)
        .upsert(chunk, { onConflict: step.conflict });
      if (error) {
        throw new Error(`Upsert failed on ${step.table} (chunk ${i}): ${error.message}`);
      }
    }
    const { count, error: countErr } = await supabase
      .from(step.table)
      .select('*', { count: 'exact', head: true });
    if (countErr) {
      throw new Error(`Count check failed on ${step.table}: ${countErr.message}`);
    }
    console.log(`Seeded ${step.table}: ${count} rows in DB`);
  }

  console.log('\nSupabase seed complete and verified.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
