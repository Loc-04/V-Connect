import {
  listUsers,
  getUserById,
  updateUserById,
  deleteUserById
} from '../services/user.service.js'
import { successResponse } from '../utils/response.js'
import {
  validatePagination,
  validateUserId,
  validateUserUpdate
} from '../utils/validators.js'

export const getUsers = async (req, res) => {
  const pagination = validatePagination(req.query)
  const { users, total } = await listUsers(pagination)
  const totalPages = Math.ceil(total / pagination.limit) || 1

  return successResponse(
    res,
    200,
    'Users fetched successfully.',
    { users },
    {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages
    }
  )
}

export const getUser = async (req, res) => {
  const userId = validateUserId(req.params.id)
  const user = await getUserById(userId, req.user)
  return successResponse(res, 200, 'User fetched successfully.', { user })
}

export const updateUser = async (req, res) => {
  const userId = validateUserId(req.params.id)
  const updates = validateUserUpdate(req.body)
  const user = await updateUserById(userId, updates, req.user)
  return successResponse(res, 200, 'User updated successfully.', { user })
}

export const deleteUser = async (req, res) => {
  const userId = validateUserId(req.params.id)
  await deleteUserById(userId)
  return successResponse(res, 200, 'User deleted successfully.')
}
