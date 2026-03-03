import { Router } from 'express'
import {
  deleteUser,
  getUser,
  getUsers,
  updateUser
} from '../controllers/user.controller.js'
import catchAsync from '../utils/catchAsync.js'
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware.js'
import { USER_ROLES } from '../models/user.model.js'

const router = Router()

router.use(authenticate)

router.get(
  '/',
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(getUsers)
)

router.get(
  '/:id',
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.ORGANIZER, USER_ROLES.VOLUNTEER),
  catchAsync(getUser)
)

router.patch(
  '/:id',
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.ORGANIZER, USER_ROLES.VOLUNTEER),
  catchAsync(updateUser)
)

router.delete(
  '/:id',
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(deleteUser)
)

export default router
