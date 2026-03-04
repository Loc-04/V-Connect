import { registerUser, loginUser } from '../services/auth.service.js'
import { successResponse } from '../utils/response.js'
import { validateLoginInput, validateRegisterInput } from '../utils/validators.js'

export const register = async (req, res) => {
  const payload = validateRegisterInput(req.body)
  const user = await registerUser(payload)
  return successResponse(res, 201, 'User registered successfully.', { user })
}

export const login = async (req, res) => {
  const payload = validateLoginInput(req.body)
  const authPayload = await loginUser(payload)
  return successResponse(res, 200, 'Login successful.', authPayload)
}
