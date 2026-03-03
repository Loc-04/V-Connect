import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import routes from './routes/index.js'
import {
  errorHandler,
  notFoundHandler
} from './middlewares/error.middleware.js'

const app = express()

app.use(helmet())
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : '*'

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(morgan('combined'))

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'V-Connect shared backend is healthy.'
  })
})

app.use('/api', routes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
