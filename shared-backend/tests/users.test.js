import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../src/app.js'

vi.mock('../src/services/user.service.js', () => ({
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  deleteUserById: vi.fn()
}))

vi.mock('../src/middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: '11111111-1111-1111-1111-111111111111',
      role: 'admin'
    }
    next()
  },
  authorizeRoles: () => (req, res, next) => next()
}))

import {
  listUsers,
  getUserById,
  updateUserById,
  deleteUserById
} from '../src/services/user.service.js'

describe('Users API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated users', async () => {
    listUsers.mockResolvedValue({
      users: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'admin@example.com',
          fullName: 'Admin User',
          role: 'admin'
        }
      ],
      total: 1
    })

    const response = await request(app).get('/api/users?limit=10&page=1')

    expect(response.status).toBe(200)
    expect(response.body.data.users).toHaveLength(1)
    expect(listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, page: 1 })
    )
  })

  it('fetches a single user by id', async () => {
    const mockUser = {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'member@example.com',
      fullName: 'Member User',
      role: 'organizer'
    }

    getUserById.mockResolvedValue(mockUser)

    const response = await request(app).get(`/api/users/${mockUser.id}`)

    expect(response.status).toBe(200)
    expect(response.body.data.user).toMatchObject(mockUser)
    expect(getUserById).toHaveBeenCalledWith(
      mockUser.id,
      expect.objectContaining({ role: 'admin' })
    )
  })

  it('updates a user profile', async () => {
    const mockUser = {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'organizer@example.com',
      fullName: 'Updated Name',
      role: 'organizer'
    }

    updateUserById.mockResolvedValue(mockUser)

    const response = await request(app)
      .patch(`/api/users/${mockUser.id}`)
      .send({ fullName: 'Updated Name' })

    expect(response.status).toBe(200)
    expect(response.body.data.user.fullName).toBe('Updated Name')
    expect(updateUserById).toHaveBeenCalledWith(
      mockUser.id,
      { full_name: 'Updated Name' },
      expect.objectContaining({ role: 'admin' })
    )
  })

  it('deletes a user by id', async () => {
    deleteUserById.mockResolvedValue()

    const response = await request(app).delete(
      '/api/users/44444444-4444-4444-4444-444444444444'
    )

    expect(response.status).toBe(200)
    expect(deleteUserById).toHaveBeenCalled()
  })
})
