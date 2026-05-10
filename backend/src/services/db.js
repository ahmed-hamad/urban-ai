import dotenv from 'dotenv'
dotenv.config({ path: 'G:/urban-ai/.env' })

console.log('DATABASE_URL =', process.env.DATABASE_URL)



import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  console.error('PostgreSQL pool unexpected error', err.message)
})

export async function query(text, params) {
  const start = Date.now()
  const res = await pool.query(text, params)
  const ms = Date.now() - start
  if (process.env.NODE_ENV !== 'production' && ms > 200) {
    console.warn(`[db] slow query (${ms}ms): ${text.slice(0, 80)}`)
  }
  return res
}

export async function getClient() {
  return pool.connect()
}

export default pool
