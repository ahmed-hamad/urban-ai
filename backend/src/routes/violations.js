import { Router } from 'express'
import multer from 'multer'
import { regulationData } from '../../../regulation_output.js'

const router = Router()
const upload = multer({ dest: 'uploads/' })

// GET /api/violations — list violation articles
router.get('/', async (req, res) => {
  const elements = regulationData.map(el => ({
    id: el.id,
    name: el.name,
    stage: el.stage,
    color: el.color,
    maxFine: el.maxFine,
    articlesCount: el.articles.length
  }))
  const articles = {}
  regulationData.forEach(el => {
    articles[el.id] = el.articles
  })
  res.json({ elements, articles })
})

// POST /api/violations/import — upload regulation file
router.post('/import', upload.single('file'), async (req, res) => {
  // TODO: parse PDF/Excel, extract articles, persist
  res.json({ success: true, parsedCount: 0 })
})

export default router
