import app from './app.js'
import env from './config/env.js'

const port = env.port

const server = app.listen(port, () => {
  console.log(`V-Connect API listening on port ${port} (${env.nodeEnv})`)
})

const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`)
  server.close(() => {
    console.log('HTTP server closed.')
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})
