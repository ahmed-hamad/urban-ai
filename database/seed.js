/**
 * UrbanAI — Development seed script
 * Usage: node database/seed.js
 *
 * Inserts baseline entities and users required for operational testing.
 * Passwords are hashed with bcrypt (10 rounds).
 *
 * Credentials:
 *   admin@urban-ai.sa      / Admin@1234      (مدير النظام — system)
 *   admin@albaha.gov.sa    / admin@2024      (مدير النظام — albaha)
 *   admin1@baha.com        / Admin@1234      (أحمد حمد — admin)
 *   manager@urban-ai.sa    / Manager@1234    (مدير إدارة)
 *   monitor@urban-ai.sa    / Monitor@1234    (مراقب ميداني)
 */

import dotenv from 'dotenv'
dotenv.config()
import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const ALL_PERMISSIONS = [
  'create_report', 'view_reports', 'edit_report', 'assign_report',
  'close_inspector', 'quality_review', 'close_final', 'reject_report',
  'manage_users', 'manage_entities', 'reset_password',
  'view_financials', 'view_audit_log', 'gis_access', 'ai_access',
]

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
    id:          'b0000000-0000-0000-0000-000000000001',
    email:       'admin@urban-ai.sa',
    password:    'Admin@1234',
    fullName:    'مدير النظام',
    role:        'admin',
    entityId:    null,
    phone:       '',
    permissions: ALL_PERMISSIONS,
    avatar:      'من',
  },
  {
    id:          'b0000000-0000-0000-0000-000000000010',
    email:       'admin@albaha.gov.sa',
    password:    'admin@2024',
    fullName:    'مدير النظام',
    role:        'admin',
    entityId:    null,
    phone:       '0171234567',
    permissions: ALL_PERMISSIONS,
    avatar:      'مد',
  },
  {
    id:          'b0000000-0000-0000-0000-000000000011',
    email:       'admin1@baha.com',
    password:    'Admin@1234',
    fullName:    'أحمد حمد',
    role:        'admin',
    entityId:    null,
    phone:       '',
    permissions: ALL_PERMISSIONS,
    avatar:      'أح',
  },
  {
    id:          'b0000000-0000-0000-0000-000000000002',
    email:       'manager@urban-ai.sa',
    password:    'Manager@1234',
    fullName:    'خالد العمري',
    role:        'manager',
    entityId:    'a0000000-0000-0000-0000-000000000001',
    phone:       '',
    permissions: ['create_report', 'view_reports', 'edit_report', 'assign_report',
                  'view_financials', 'view_audit_log', 'gis_access', 'reset_password'],
    avatar:      'خع',
  },
  {
    id:          'b0000000-0000-0000-0000-000000000003',
    email:       'monitor@urban-ai.sa',
    password:    'Monitor@1234',
    fullName:    'أحمد السلمي',
    role:        'monitor',
    entityId:    'a0000000-0000-0000-0000-000000000001',
    phone:       '',
    permissions: ['view_reports', 'create_report', 'close_inspector', 'gis_access', 'ai_access'],
    avatar:      'أس',
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
        `INSERT INTO users (id, email, password_hash, full_name, role, entity_id, phone, permissions, avatar)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           full_name     = EXCLUDED.full_name,
           role          = EXCLUDED.role,
           entity_id     = EXCLUDED.entity_id,
           phone         = EXCLUDED.phone,
           permissions   = EXCLUDED.permissions,
           avatar        = EXCLUDED.avatar,
           status        = 'active'`,
        [u.id, u.email, hash, u.fullName, u.role, u.entityId, u.phone, u.permissions, u.avatar],
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
