import {
  listActivities,
  createActivity,
  getActivityById,
  updateActivityById,
  deleteActivityById
} from '../services/activity.service.js'
import { successResponse } from '../utils/response.js'
import {
  validateActivityCreate,
  validateActivityFilters,
  validateActivityId,
  validateActivityUpdate,
  validateUserId
} from '../utils/validators.js'
import { USER_ROLES } from '../models/user.model.js'

export const getActivities = async (req, res) => {
  const filters = validateActivityFilters(req.query)
  const { activities, total } = await listActivities(filters)
  const totalPages = Math.ceil(total / filters.limit) || 1

  return successResponse(
    res,
    200,
    'Activities fetched successfully.',
    { activities },
    {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages
    }
  )
}

export const createNewActivity = async (req, res) => {
  const payload = validateActivityCreate(req.body)
  let organizerId = req.user.id

  if (req.user.role === USER_ROLES.ADMIN && req.body.organizerId) {
    organizerId = validateUserId(req.body.organizerId)
  }

  const activity = await createActivity(payload, organizerId)
  return successResponse(res, 201, 'Activity created successfully.', { activity })
}

export const getActivity = async (req, res) => {
  const activityId = validateActivityId(req.params.id)
  const activity = await getActivityById(activityId)
  return successResponse(res, 200, 'Activity fetched successfully.', { activity })
}

export const updateActivity = async (req, res) => {
  const activityId = validateActivityId(req.params.id)
  const updates = validateActivityUpdate(req.body)
  const activity = await updateActivityById(activityId, updates, req.user)
  return successResponse(res, 200, 'Activity updated successfully.', { activity })
}

export const deleteActivity = async (req, res) => {
  const activityId = validateActivityId(req.params.id)
  await deleteActivityById(activityId, req.user)
  return successResponse(res, 200, 'Activity deleted successfully.')
}
