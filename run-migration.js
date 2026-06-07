// Usage: node run-migration.js [migration-file]
// Examples:
//   node run-migration.js 023_element_mapping_engine.sql
//   node run-migration.js database/migrations/023_element_mapping_engine.sql
//   node run-migration.js          ← runs ALL migrations in order

import dotenv from 'dotenv'
dotenv.config()
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const MIGRATIONS_DIR = 'database/migrations'

async function runFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8')
  await pool.query(sql)
  console.log(`✓ Applied: ${path.basename(filePath)}`)
}

async function main() {
  const arg = process.argv[2]

  try {
    if (arg) {
      // Single migration — accept bare filename or full path
      const filePath = arg.includes('/') || arg.includes('\\')
        ? arg
        : path.join(MIGRATIONS_DIR, arg.endsWith('.sql') ? arg : `${arg}.sql`)

      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`)
        process.exit(1)
      }
      await runFile(filePath)
    } else {
      // All migrations in numeric order
      const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort()

      for (const file of files) {
        await runFile(path.join(MIGRATIONS_DIR, file))
      }
    }
    console.log('Done.')
  } catch (err) {
    console.error('Migration error:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
