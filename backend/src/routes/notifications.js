import { Router } from 'express'
import { query } from '../services/db.js'

const router = Router()

// GET /api/notifications — current user's inbox (latest 60)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, type, title, body, link, report_id, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 60`,
      [req.user.id],
    )
    const unread = rows.filter(n => !n.is_read).length
    res.json({ notifications: rows, unread })
  } catch (err) {
    // Table may not exist yet if migration hasn't run
    if (err.code === '42P01') return res.json({ notifications: [], unread: 0 })
    throw err
  }
})

// PATCH /api/notifications/read-all — mark every unread notification as read
router.patch('/read-all', async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [req.user.id],
    )
  } catch (err) {
    if (err.code !== '42P01') throw err
  }
  res.json({ success: true })
})

// PATCH /api/notifications/:id/read — mark a single notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id],
    )
  } catch (err) {
    if (err.code !== '42P01') throw err
  }
  res.json({ success: true })
})

export default router
