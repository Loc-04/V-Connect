import { Router } from 'express'
import catchAsync from '../utils/catchAsync.js'
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware.js'
import { USER_ROLES } from '../models/user.model.js'
import {
  createNewActivity,
  deleteActivity,
  getActivities,
  getActivity,
  updateActivity
} from '../controllers/activity.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', catchAsync(getActivities))
router.post(
  '/',
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.ORGANIZER),
  catchAsync(createNewActivity)
)
router.get('/:id', catchAsync(getActivity))
router.patch(
  '/:id',
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.ORGANIZER),
  catchAsync(updateActivity)
)
router.delete(
  '/:id',
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.ORGANIZER),
  catchAsync(deleteActivity)
)

export default router
