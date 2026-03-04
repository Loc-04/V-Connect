import ApiError from '../utils/ApiError.js'
import { supabase } from '../config/supabase.client.js'
import {
  ACTIVITY_TABLE,
  ACTIVITY_PUBLIC_FIELDS,
  sanitizeActivity
} from '../models/activity.model.js'
import { USER_ROLES } from '../models/user.model.js'

const ensureSupabase = () => {
  if (!supabase) {
    throw new ApiError(500, 'Supabase client is not initialized.')
  }
}

const escapeIlike = (value) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,')

const ensureCanModify = (actor, activity) => {
  if (actor.role === USER_ROLES.ADMIN) {
    return
  }
  if (actor.role !== USER_ROLES.ORGANIZER || actor.id !== activity.organizerId) {
    throw new ApiError(403, 'You do not have permission to modify this activity.')
  }
}

const fetchActivityOrThrow = async (id) => {
  const { data, error, status } = await supabase
    .from(ACTIVITY_TABLE)
    .select(ACTIVITY_PUBLIC_FIELDS)
    .eq('id', id)
    .single()

  if (error && status !== 406) {
    throw new ApiError(500, 'Failed to fetch activity.', error.message)
  }

  if (!data) {
    throw new ApiError(404, 'Activity not found.')
  }

  return sanitizeActivity(data)
}

export const listActivities = async ({
  limit,
  offset,
  search,
  status,
  organizerId
}) => {
  ensureSupabase()

  let query = supabase
    .from(ACTIVITY_TABLE)
    .select(ACTIVITY_PUBLIC_FIELDS, { count: 'exact' })
    .order('start_time', { ascending: true })
    .range(offset, offset + limit - 1)

  if (search) {
    const term = `%${escapeIlike(search)}%`
    query = query.or(`title.ilike.${term},description.ilike.${term}`)
  }

  if (status) {
    query = query.eq('status', status)
  }

  if (organizerId) {
    query = query.eq('organizer_id', organizerId)
  }

  const { data, error, count } = await query

  if (error) {
    throw new ApiError(500, 'Failed to fetch activities.', error.message)
  }

  return {
    activities: (data || []).map(sanitizeActivity),
    total: count || 0
  }
}

export const createActivity = async (activityPayload, organizerId) => {
  ensureSupabase()

  const insertPayload = {
    ...activityPayload,
    organizer_id: organizerId
  }

  const { data, error } = await supabase
    .from(ACTIVITY_TABLE)
    .insert(insertPayload)
    .select(ACTIVITY_PUBLIC_FIELDS)
    .single()

  if (error) {
    throw new ApiError(500, 'Failed to create activity.', error.message)
  }

  return sanitizeActivity(data)
}

export const getActivityById = async (id) => {
  ensureSupabase()
  return fetchActivityOrThrow(id)
}

export const updateActivityById = async (id, updates, actor) => {
  ensureSupabase()

  const activity = await fetchActivityOrThrow(id)
  ensureCanModify(actor, activity)

  const patch = {
    ...updates,
    updated_at: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from(ACTIVITY_TABLE)
    .update(patch)
    .eq('id', id)
    .select(ACTIVITY_PUBLIC_FIELDS)
    .single()

  if (error) {
    throw new ApiError(500, 'Failed to update activity.', error.message)
  }

  if (!data) {
    throw new ApiError(404, 'Activity not found.')
  }

  return sanitizeActivity(data)
}

export const deleteActivityById = async (id, actor) => {
  ensureSupabase()

  const activity = await fetchActivityOrThrow(id)
  ensureCanModify(actor, activity)

  const { data, error } = await supabase
    .from(ACTIVITY_TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .single()

  if (error) {
    throw new ApiError(500, 'Failed to delete activity.', error.message)
  }

  if (!data) {
    throw new ApiError(404, 'Activity not found.')
  }
}
