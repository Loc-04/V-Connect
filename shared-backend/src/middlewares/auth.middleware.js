import jwt from 'jsonwebtoken'
import env from '../config/env.js'
import ApiError from '../utils/ApiError.js'
import { supabase } from '../config/supabase.client.js'
import { USER_PUBLIC_FIELDS, USER_TABLE, sanitizeUser } from '../models/user.model.js'

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Authentication token missing.'))
  }

  const token = authHeader.substring(7)

  try {
    const payload = jwt.verify(token, env.jwtSecret)

    if (!supabase) {
      throw new ApiError(500, 'Supabase client is not initialized.')
    }

    const { data, error, status } = await supabase
      .from(USER_TABLE)
      .select(USER_PUBLIC_FIELDS)
      .eq('id', payload.sub)
      .single()

    if (error && status !== 406) {
      throw new ApiError(401, 'Unable to validate user.', error.message)
    }

    if (!data) {
      throw new ApiError(401, 'User does not exist.')
    }

    req.user = sanitizeUser(data)
    next()
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error)
    }
    next(new ApiError(401, 'Invalid or expired authentication token.'))
  }
}

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action.'))
    }
    next()
  }
}
