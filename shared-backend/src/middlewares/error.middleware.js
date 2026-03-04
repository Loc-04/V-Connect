import ApiError from '../utils/ApiError.js'
import env from '../config/env.js'

export const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, `Resource not found: ${req.originalUrl}`))
}

export const errorHandler = (err, req, res, next) => {
  const statusCode = err instanceof ApiError ? err.statusCode : 500
  const response = {
    success: false,
    message: err.message || 'An unexpected error occurred.'
  }

  if (err.details) {
    response.details = err.details
  }

  if (env.nodeEnv === 'development') {
    response.stack = err.stack
  }

  res.status(statusCode).json(response)
}
