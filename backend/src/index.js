import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import reportsRouter from './routes/reports.js'
import usersRouter from './routes/users.js'
import violationsRouter from './routes/violations.js'
import authRouter from './routes/auth.js'
import ingestionRouter from './routes/ingestion.js'
import { authMiddleware } from './middleware/auth.js'

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json({ limit: '10mb' }))

// Serve uploaded media files statically so frontend can preview them
const UPLOAD_ROOT = process.env.UPLOAD_PATH ?? 'uploads'
app.use('/uploads', express.static(path.resolve(UPLOAD_ROOT)))

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }))

// Auth (no middleware on login; logout/me use authMiddleware internally)
app.use('/api/auth', authRouter)

// Protected routes — RBAC enforced inside each router
app.use('/api/reports', authMiddleware, reportsRouter)
app.use('/api/users', authMiddleware, usersRouter)
app.use('/api/violations', violationsRouter)
app.use('/api/ingestion', authMiddleware, ingestionRouter)

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }))

// Error handler
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => console.log(`Urban AI API running on :${PORT}`))
