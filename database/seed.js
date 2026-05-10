/**
 * UrbanAI — Development seed script
 * Usage: node database/seed.js
 *
 * Inserts baseline entities and users required for operational testing.
 * Passwords are hashed with bcrypt (10 rounds).
 *
 * Test credentials:
 *   admin@urban-ai.sa     / Admin@1234
 *   manager@urban-ai.sa   / Manager@1234
 *   monitor@urban-ai.sa   / Monitor@1234
 */

import dotenv from 'dotenv'
dotenv.config()
import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const ENTITIES = [
  {
    id:   'a0000000-0000-0000-0000-000000000001',
    name: 'أمانة منطقة الباحة',
    type: 'internal',
    code: 'ALBAHA_MUNI',
    default_for_elements: ['concrete_barriers', 'street_excavation', 'illegal_signs'],
  },
  {
    id:   'a0000000-0000-0000-0000-000000000002',
    name: 'بلدية شمال الباحة',
    type: 'internal',
    code: 'NORTH_DIST',
    default_for_elements: ['empty_lots', 'building_facades'],
  },
]

const USERS = [
  {
    id:       'b0000000-0000-0000-0000-000000000001',
    email:    'admin@urban-ai.sa',
    password: 'Admin@1234',
    fullName: 'مدير النظام',
    role:     'admin',
    entityId: 'a0000000-0000-0000-0000-000000000001',
    permissions: ['view_reports', 'create_report', 'assign_report', 'close_inspector',
                  'quality_review', 'close_final', 'reject_report'],
    avatar: 'من',
  },
  {
    id:       'b0000000-0000-0000-0000-000000000002',
    email:    'manager@urban-ai.sa',
    password: 'Manager@1234',
    fullName: 'خالد العمري',
    role:     'manager',
    entityId: 'a0000000-0000-0000-0000-000000000001',
    permissions: ['view_reports', 'create_report', 'assign_report', 'reject_report'],
    avatar: 'خع',
  },
  {
    id:       'b0000000-0000-0000-0000-000000000003',
    email:    'monitor@urban-ai.sa',
    password: 'Monitor@1234',
    fullName: 'أحمد السلمي',
    role:     'monitor',
    entityId: 'a0000000-0000-0000-0000-000000000001',
    permissions: ['view_reports', 'create_report', 'close_inspector'],
    avatar: 'أس',
  },
]

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    console.log('Seeding entities…')
    for (const e of ENTITIES) {
      await client.query(
        `INSERT INTO entities (id, name, type, code, default_for_elements)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [e.id, e.name, e.type, e.code, e.default_for_elements],
      )
      console.log(`  ✓ ${e.name}`)
    }

    console.log('Seeding users…')
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10)
      await client.query(
        `INSERT INTO users (id, email, password_hash, full_name, role, entity_id, permissions, avatar)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           entity_id = EXCLUDED.entity_id`,
        [u.id, u.email, hash, u.fullName, u.role, u.entityId, u.permissions, u.avatar],
      )
      console.log(`  ✓ ${u.email} (${u.role}) — password: ${u.password}`)
    }

    await client.query('COMMIT')
    console.log('\nSeed complete.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Seed failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
