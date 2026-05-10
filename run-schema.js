import dotenv from 'dotenv'
dotenv.config()
import pg from 'pg'
import fs from 'fs'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function runSchema() {
  try {
    const schema = fs.readFileSync('database/schema.sql', 'utf8')
    await pool.query(schema)
    console.log('Schema applied successfully')
  } catch (error) {
    console.error('Error applying schema:', error)
  } finally {
    await pool.end()
  }
}

runSchema()