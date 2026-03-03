import jwt from 'jsonwebtoken'
import ApiError from '../utils/ApiError.js'
import { supabase } from '../config/supabase.client.js'
import {
  USER_TABLE,
  USER_PUBLIC_FIELDS,
  sanitizeUser
} from '../models/user.model.js'
import { hashPassword, comparePassword } from '../utils/password.js'
import env from '../config/env.js'

const ensureSupabase = () => {
  if (!supabase) {
    throw new ApiError(500, 'Supabase client is not initialized.')
  }
}

const generateToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  )
}

export const registerUser = async ({ email, password, fullName, role }) => {
  ensureSupabase()

  const { data: existingUsers, error: lookupError } = await supabase
    .from(USER_TABLE)
    .select('id')
    .eq('email', email)

  if (lookupError) {
    throw new ApiError(500, 'Unable to verify email uniqueness.', lookupError.message)
  }

  if (existingUsers && existingUsers.length > 0) {
    throw new ApiError(409, 'Email already registered.')
  }

  const passwordHash = await hashPassword(password)
  const timestamp = new Date().toISOString()

  const { data, error } = await supabase
    .from(USER_TABLE)
    .insert({
      email,
      password_hash: passwordHash,
      full_name: fullName,
      role,
      created_at: timestamp,
      updated_at: timestamp
    })
    .select(USER_PUBLIC_FIELDS)
    .single()

  if (error) {
    throw new ApiError(500, 'Failed to create user.', error.message)
  }

  return sanitizeUser(data)
}

export const loginUser = async ({ email, password }) => {
  ensureSupabase()

  const { data, error, status } = await supabase
    .from(USER_TABLE)
    .select(`${USER_PUBLIC_FIELDS}, password_hash`)
    .eq('email', email)
    .single()

  if (error && status !== 406) {
    throw new ApiError(401, 'Invalid credentials.')
  }

  if (!data) {
    throw new ApiError(401, 'Invalid credentials.')
  }

  const validPassword = await comparePassword(password, data.password_hash)
  if (!validPassword) {
    throw new ApiError(401, 'Invalid credentials.')
  }

  const user = sanitizeUser(data)
  const token = generateToken(user)

  return { token, user }
}
