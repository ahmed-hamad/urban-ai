import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'fs'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const MIGRATIONS_DIR = resolve(__dirname, 'database/migrations')
const SCHEMA_FILE    = resolve(__dirname, 'database/schema.sql')

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  )
  return new Set(rows.map(r => r.filename))
}

async function run() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Check if core tables already exist
    const { rows } = await client.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    `)
    const tablesExist = parseInt(rows[0].cnt) > 0

    if (!tablesExist) {
      console.log('Applying schema.sql ...')
      const schema = fs.readFileSync(SCHEMA_FILE, 'utf8')
      await client.query(schema)
      console.log('  schema.sql applied.')
    } else {
      console.log('Core tables already exist — skipping schema.sql.')
    }

    await ensureMigrationsTable(client)
    const applied = await getAppliedMigrations(client)

    // Run migrations in order
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort()

    let ran = 0
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  [skip] ${file}`)
        continue
      }
      console.log(`  [run]  ${file}`)
      const sql = fs.readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8')
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)', [file]
      )
      ran++
    }

    await client.query('COMMIT')
    console.log(`\nDone. ${ran} migration(s) applied.`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Setup failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
