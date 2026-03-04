import ApiError from '../utils/ApiError.js'
import { supabase } from '../config/supabase.client.js'
import {
  USER_TABLE,
  USER_PUBLIC_FIELDS,
  USER_ROLES,
  sanitizeUser
} from '../models/user.model.js'
import { hashPassword } from '../utils/password.js'

const ensureSupabase = () => {
  if (!supabase) {
    throw new ApiError(500, 'Supabase client is not initialized.')
  }
}

const escapeIlike = (value) =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, '\\,')

export const listUsers = async ({ limit, offset, search }) => {
  ensureSupabase()
  let query = supabase
    .from(USER_TABLE)
    .select(USER_PUBLIC_FIELDS, { count: 'exact' })
    .range(offset, offset + limit - 1)

  if (search) {
    const term = `%${escapeIlike(search)}%`
    query = query.or(`email.ilike.${term},full_name.ilike.${term}`)
  }

  const { data, error, count } = await query

  if (error) {
    throw new ApiError(500, 'Failed to fetch users.', error.message)
  }

  return {
    users: (data || []).map(sanitizeUser),
    total: count || 0
  }
}

export const getUserById = async (id, actor) => {
  ensureSupabase()

  if (actor.role !== USER_ROLES.ADMIN && actor.id !== id) {
    throw new ApiError(403, 'You are not allowed to access this user.')
  }

  const { data, error, status } = await supabase
    .from(USER_TABLE)
    .select(USER_PUBLIC_FIELDS)
    .eq('id', id)
    .single()

  if (error && status !== 406) {
    throw new ApiError(404, 'User not found.')
  }

  if (!data) {
    throw new ApiError(404, 'User not found.')
  }

  return sanitizeUser(data)
}

const ensureUpdatePermissions = (actor, targetId, attemptedRoleUpdate) => {
  if (actor.role === USER_ROLES.ADMIN) {
    return
  }

  if (actor.id !== targetId) {
    throw new ApiError(403, 'You can only manage your own profile.')
  }

  if (attemptedRoleUpdate) {
    throw new ApiError(403, 'Only admins can change user roles.')
  }
}

export const updateUserById = async (id, updates, actor) => {
  ensureSupabase()

  const attemptedRoleUpdate = Object.prototype.hasOwnProperty.call(updates, 'role')
  ensureUpdatePermissions(actor, id, attemptedRoleUpdate)

  const patch = { updated_at: new Date().toISOString() }

  if (updates.full_name) {
    patch.full_name = updates.full_name
  }

  if (updates.role) {
    patch.role = updates.role
  }

  if (updates.password) {
    patch.password_hash = await hashPassword(updates.password)
  }

  const { data, error } = await supabase
    .from(USER_TABLE)
    .update(patch)
    .eq('id', id)
    .select(USER_PUBLIC_FIELDS)
    .single()

  if (error) {
    throw new ApiError(500, 'Failed to update user.', error.message)
  }

  if (!data) {
    throw new ApiError(404, 'User not found.')
  }

  return sanitizeUser(data)
}

export const deleteUserById = async (id) => {
  ensureSupabase()

  const { data, error } = await supabase
    .from(USER_TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .single()

  if (error) {
    throw new ApiError(500, 'Failed to delete user.', error.message)
  }

  if (!data) {
    throw new ApiError(404, 'User not found.')
  }
}
