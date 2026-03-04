import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../src/app.js'

vi.mock('../src/services/activity.service.js', () => ({
  listActivities: vi.fn(),
  createActivity: vi.fn(),
  getActivityById: vi.fn(),
  updateActivityById: vi.fn(),
  deleteActivityById: vi.fn()
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
  listActivities,
  createActivity,
  getActivityById,
  updateActivityById,
  deleteActivityById
} from '../src/services/activity.service.js'

describe('Activities API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists activities with pagination', async () => {
    listActivities.mockResolvedValue({
      activities: [
        {
          id: 'a1',
          title: 'Cleanup',
          status: 'published'
        }
      ],
      total: 1
    })

    const response = await request(app).get('/api/activities?limit=5&page=1')

    expect(response.status).toBe(200)
    expect(response.body.data.activities).toHaveLength(1)
    expect(listActivities).toHaveBeenCalled()
  })

  it('creates a new activity', async () => {
    const mockActivity = {
      id: 'a2',
      title: 'Food Drive',
      status: 'draft'
    }
    createActivity.mockResolvedValue(mockActivity)

    const payload = {
      title: 'Food Drive',
      description: 'Help distribute food.',
      location: { address: '123 Main', city: 'Town', lat: 1, lng: 2 },
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      capacity: 20,
      requiredSkills: ['cooking']
    }

    const response = await request(app).post('/api/activities').send(payload)

    expect(response.status).toBe(201)
    expect(response.body.data.activity).toMatchObject(mockActivity)
    expect(createActivity).toHaveBeenCalled()
  })

  it('updates an activity', async () => {
    const mockActivity = {
      id: 'a3',
      title: 'Updated Title',
      status: 'published'
    }
    updateActivityById.mockResolvedValue(mockActivity)

    const response = await request(app)
      .patch('/api/activities/a3')
      .send({ title: 'Updated Title', description: 'Long description text' })

    expect(response.status).toBe(200)
    expect(updateActivityById).toHaveBeenCalled()
  })

  it('deletes an activity', async () => {
    deleteActivityById.mockResolvedValue()

    const response = await request(app).delete('/api/activities/a4')

    expect(response.status).toBe(200)
    expect(deleteActivityById).toHaveBeenCalledWith(
      'a4',
      expect.objectContaining({ role: 'admin' })
    )
  })
})
