import { Router } from 'express'
import { login, register } from '../controllers/auth.controller.js'
import catchAsync from '../utils/catchAsync.js'

const router = Router()

router.post('/register', catchAsync(register))
router.post('/login', catchAsync(login))

export default router
