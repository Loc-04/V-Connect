import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../src/app.js'
import { USER_ROLES } from '../src/models/user.model.js'

vi.mock('../src/services/auth.service.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn()
}))

import { registerUser, loginUser } from '../src/services/auth.service.js'

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a new user', async () => {
    const mockUser = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'new@example.com',
      fullName: 'New User',
      role: USER_ROLES.VOLUNTEER
    }

    registerUser.mockResolvedValue(mockUser)

    const response = await request(app).post('/api/auth/register').send({
      email: mockUser.email,
      password: 'SuperSecret1!',
      fullName: mockUser.fullName
    })

    expect(response.status).toBe(201)
    expect(response.body.data.user).toMatchObject({
      email: mockUser.email,
      fullName: mockUser.fullName
    })
    expect(registerUser).toHaveBeenCalledWith({
      email: mockUser.email,
      password: 'SuperSecret1!',
      fullName: mockUser.fullName,
      role: USER_ROLES.VOLUNTEER
    })
  })

  it('logs in a user and returns a token', async () => {
    const mockAuthPayload = {
      token: 'jwt-token',
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'demo@example.com',
        fullName: 'Demo User',
        role: USER_ROLES.ADMIN
      }
    }

    loginUser.mockResolvedValue(mockAuthPayload)

    const response = await request(app).post('/api/auth/login').send({
      email: mockAuthPayload.user.email,
      password: 'SuperSecret1!'
    })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject(mockAuthPayload)
    expect(loginUser).toHaveBeenCalledWith({
      email: mockAuthPayload.user.email,
      password: 'SuperSecret1!'
    })
  })

  it('returns validation error on bad payload', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'invalid',
      password: 'short',
      fullName: ''
    })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
  })
})
