// Admin Demo Data Cleanup Utility
//
// Removes all AI/ingestion test data and AI-generated draft reports while
// preserving the governed platform data (users, roles, GIS layers, contracts,
// workflow configuration, etc.).
//
// Usage:
//   node admin-cleanup.js          — dry-run (shows counts, no deletions)
//   node admin-cleanup.js --run    — execute deletions and print per-table report
//
// What is REMOVED:
//   - ai_training_samples
//   - detection_candidates
//   - media_ingestions
//   - reports where ingestion_source IN ('media_upload','gis_import')
//     AND status = 'draft'               (AI/imported draft reports only)
//   - orphaned report_media rows for the above deleted reports
//
// What is PRESERVED (never touched):
//   - users, user_roles, roles, permissions
//   - reports with status != 'draft' (submitted and beyond — live workflow)
//   - manually created draft reports (ingestion_source = 'manual')
//   - gis_layers, spatial_features, municipalities, districts, neighborhoods
//   - priority_zones, service_areas
//   - maintenance_contracts, cleaning_contracts
//   - workflow_config, case_workflow_transitions
//   - entities, entity_hierarchy
//   - regulation_elements, regulation_articles
//   - audit_logs (immutable — never deleted)
//   - notifications

import dotenv from 'dotenv'
dotenv.config()
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const DRY_RUN = !process.argv.includes('--run')

async function count(client, table, where = '1=1', params = []) {
  const { rows: [{ n }] } = await client.query(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
    params,
  )
  return Number(n)
}

async function main() {
  const client = await pool.connect()
  const report = []

  console.log('')
  console.log(DRY_RUN
    ? '═══════════════════════════════════════════════════'
    : '═══════════════════════════════════════════════════')
  console.log(DRY_RUN
    ? '  ADMIN CLEANUP — DRY RUN (no changes)'
    : '  ADMIN CLEANUP — EXECUTING')
  console.log('═══════════════════════════════════════════════════')
  console.log('')

  try {
    // ── 1. Count AI-generated/imported draft reports ──────────────────────────
    const draftReportIds = await client.query(
      `SELECT id FROM reports
       WHERE ingestion_source IN ('media_upload','gis_import')
         AND status = 'draft'`,
    ).then(r => r.rows.map(x => x.id))

    const draftReportCount = draftReportIds.length

    // ── 2. Count orphaned report_media for those reports ─────────────────────
    const orphanMediaCount = draftReportIds.length > 0
      ? await count(client, 'report_media', 'report_id = ANY($1::uuid[])', [draftReportIds])
      : 0

    // ── 3. Count other targets ────────────────────────────────────────────────
    const trainingSamples    = await count(client, 'ai_training_samples')
    const candidates         = await count(client, 'detection_candidates')
    const ingestions         = await count(client, 'media_ingestions')

    // ── 4. Count what will be PRESERVED ──────────────────────────────────────
    const liveReports        = await count(client, 'reports', `status != 'deleted' AND NOT (ingestion_source IN ('media_upload','gis_import') AND status = 'draft')`)
    const users              = await count(client, 'users')
    const gisLayers          = await count(client, 'gis_layers').catch(() => 0)

    console.log('┌─ TO BE REMOVED ─────────────────────────────────────')
    console.log(`│  ai_training_samples              ${String(trainingSamples).padStart(6)}`)
    console.log(`│  detection_candidates             ${String(candidates).padStart(6)}`)
    console.log(`│  media_ingestions                 ${String(ingestions).padStart(6)}`)
    console.log(`│  draft reports (AI/GIS import)    ${String(draftReportCount).padStart(6)}`)
    console.log(`│  orphaned report_media            ${String(orphanMediaCount).padStart(6)}`)
    console.log('├─ PRESERVED ─────────────────────────────────────────')
    console.log(`│  live reports (submitted+)        ${String(liveReports).padStart(6)}`)
    console.log(`│  users                            ${String(users).padStart(6)}`)
    console.log(`│  GIS layers                       ${String(gisLayers).padStart(6)}`)
    console.log('└─────────────────────────────────────────────────────')
    console.log('')

    if (DRY_RUN) {
      console.log('  Run with --run to execute deletions.')
      console.log('')
      return
    }

    // ── EXECUTE ───────────────────────────────────────────────────────────────

    await client.query('BEGIN')

    // 1. AI training samples (FK to detection_candidates — delete first)
    const { rowCount: r1 } = await client.query(`DELETE FROM ai_training_samples`)
    report.push({ table: 'ai_training_samples', removed: r1 })

    // 2. Orphaned report_media for AI/imported draft reports
    let r2 = 0
    if (draftReportIds.length > 0) {
      const { rowCount } = await client.query(
        `DELETE FROM report_media WHERE report_id = ANY($1::uuid[])`,
        [draftReportIds],
      )
      r2 = rowCount
    }
    report.push({ table: 'report_media (orphaned)', removed: r2 })

    // 3. Draft reports from AI/GIS imports (FK to detection_candidates via detection_candidate_id)
    const { rowCount: r3 } = await client.query(
      `DELETE FROM reports
       WHERE ingestion_source IN ('media_upload','gis_import')
         AND status = 'draft'`,
    )
    report.push({ table: 'reports (AI/GIS draft)', removed: r3 })

    // 4. Detection candidates (FK from reports now removed)
    const { rowCount: r4 } = await client.query(`DELETE FROM detection_candidates`)
    report.push({ table: 'detection_candidates', removed: r4 })

    // 5. Media ingestions (FK from detection_candidates now removed)
    const { rowCount: r5 } = await client.query(`DELETE FROM media_ingestions`)
    report.push({ table: 'media_ingestions', removed: r5 })

    await client.query('COMMIT')

    console.log('┌─ CLEANUP REPORT ─────────────────────────────────────')
    let totalRemoved = 0
    for (const { table, removed } of report) {
      console.log(`│  ${table.padEnd(35)} ${String(removed).padStart(6)} rows removed`)
      totalRemoved += removed
    }
    console.log('├──────────────────────────────────────────────────────')
    console.log(`│  TOTAL                                ${String(totalRemoved).padStart(6)} rows removed`)
    console.log('└──────────────────────────────────────────────────────')
    console.log('')
    console.log('  Preserved: users · roles · GIS layers · contracts ·')
    console.log('             workflow config · live reports · audit logs')
    console.log('')
    console.log('  ✓ Cleanup complete.')
    console.log('')

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Error during cleanup:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
