// Run pending migrations against the database configured in ../.env
// Usage: node database/migrate.mjs

import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// ─── Migration tracking table ─────────────────────────────────────────────────
async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function appliedMigrations(client) {
  const { rows } = await client.query('SELECT filename FROM _migrations ORDER BY filename')
  return new Set(rows.map(r => r.filename))
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const client = await pool.connect()
  try {
    await ensureTrackingTable(client)
    const applied = await appliedMigrations(client)

    const pending = files.filter(f => !applied.has(f))
    if (pending.length === 0) {
      console.log('✓ All migrations already applied.')
      return
    }

    console.log(`Applying ${pending.length} pending migration(s):\n`)

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      process.stdout.write(`  → ${file} ... `)
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log('done')
      } catch (err) {
        await client.query('ROLLBACK')
        console.log('FAILED')
        console.error(`\n  Error in ${file}:\n  ${err.message}\n`)
        process.exit(1)
      }
    }

    console.log('\n✓ All migrations applied.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
