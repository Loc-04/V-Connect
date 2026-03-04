import ApiError from './ApiError.js'
import { ROLE_VALUES, USER_ROLES } from '../models/user.model.js'
import {
  ACTIVITY_STATUS_VALUES,
  ACTIVITY_STATUSES
} from '../models/activity.model.js'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const buildError = (details) => {
  throw new ApiError(400, 'Validation error', details)
}

export const validateRegisterInput = (payload = {}) => {
  const details = []
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const password = typeof payload.password === 'string' ? payload.password.trim() : ''
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : ''
  const role = USER_ROLES.VOLUNTEER

  if (!emailRegex.test(email)) {
    details.push('A valid email address is required.')
  }

  if (password.length < 8) {
    details.push('Password must be at least 8 characters long.')
  }

  if (fullName.length < 2) {
    details.push('Full name must be at least 2 characters long.')
  }

  if (details.length) {
    buildError(details)
  }

  return {
    email,
    password,
    fullName,
    role
  }
}

export const validateLoginInput = (payload = {}) => {
  const details = []
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const password = typeof payload.password === 'string' ? payload.password.trim() : ''

  if (!emailRegex.test(email)) {
    details.push('A valid email address is required.')
  }

  if (!password) {
    details.push('Password is required.')
  }

  if (details.length) {
    buildError(details)
  }

  return { email, password }
}

export const validateUuid = (id) => {
  if (!uuidRegex.test(id)) {
    buildError(['Invalid id format.'])
  }
  return id
}

export const validateUserId = (id) => validateUuid(id)

export const validateActivityId = (id) => validateUuid(id)

export const validateUserUpdate = (payload = {}) => {
  const details = []
  const update = {}

  if (typeof payload.fullName === 'string') {
    const fullName = payload.fullName.trim()
    if (fullName.length < 2) {
      details.push('Full name must be at least 2 characters long.')
    } else {
      update.full_name = fullName
    }
  }

  if (typeof payload.password === 'string') {
    const password = payload.password.trim()
    if (password && password.length < 8) {
      details.push('Password must be at least 8 characters long.')
    } else if (password) {
      update.password = password
    }
  }

  if (typeof payload.role === 'string') {
    const role = payload.role.trim().toLowerCase()
    if (!ROLE_VALUES.includes(role)) {
      details.push(`Role must be one of: ${ROLE_VALUES.join(', ')}`)
    } else {
      update.role = role
    }
  }

  if (Object.keys(update).length === 0) {
    details.push('At least one field (fullName, password, role) must be provided.')
  }

  if (details.length) {
    buildError(details)
  }

  return update
}

export const validatePagination = (query = {}) => {
  const parsedLimit = Number(query.limit)
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 25
  const limit = Math.min(Math.max(safeLimit, 1), 100)
  const parsedPage = Number(query.page)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const offset = (page - 1) * limit
  const search = typeof query.search === 'string' ? query.search.trim() : ''

  return { limit, offset, page, search }
}

const normalizeSkills = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

const validateLocation = (location, details, isRequired = true) => {
  if (!location) {
    if (isRequired) {
      details.push('Location is required.')
    }
    return null
  }

  const address = typeof location.address === 'string' ? location.address.trim() : ''
  const city = typeof location.city === 'string' ? location.city.trim() : ''
  const lat = Number(location.lat)
  const lng = Number(location.lng)

  if (!address) {
    details.push('Location address is required.')
  }
  if (!city) {
    details.push('Location city is required.')
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    details.push('Location coordinates must be valid numbers.')
  }

  return {
    address,
    city,
    lat,
    lng
  }
}

const validateActivityTimeRange = (start, end, details, required = false) => {
  let startDate = null
  let endDate = null

  if (start !== undefined) {
    startDate = new Date(start)
    if (Number.isNaN(startDate.getTime())) {
      details.push('startTime must be a valid ISO 8601 date string.')
    }
  } else if (required) {
    details.push('startTime is required.')
  }

  if (end !== undefined) {
    endDate = new Date(end)
    if (Number.isNaN(endDate.getTime())) {
      details.push('endTime must be a valid ISO 8601 date string.')
    }
  } else if (required) {
    details.push('endTime is required.')
  }

  if (
    startDate &&
    endDate &&
    startDate.getTime() >= endDate.getTime()
  ) {
    details.push('endTime must be after startTime.')
  }

  return {
    startTime: startDate ? startDate.toISOString() : undefined,
    endTime: endDate ? endDate.toISOString() : undefined
  }
}

export const validateActivityCreate = (payload = {}) => {
  const details = []
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const description =
    typeof payload.description === 'string' ? payload.description.trim() : ''
  const capacity = Number(payload.capacity)
  const requiredSkills = normalizeSkills(payload.requiredSkills)
  const status = payload.status
    ? payload.status.toLowerCase()
    : ACTIVITY_STATUSES.DRAFT

  if (title.length < 3) {
    details.push('Title must be at least 3 characters long.')
  }

  if (description.length < 10) {
    details.push('Description must be at least 10 characters long.')
  }

  if (!Number.isFinite(capacity) || capacity < 1) {
    details.push('Capacity must be a positive number.')
  }

  const location = validateLocation(payload.location, details, true)
  const { startTime, endTime } = validateActivityTimeRange(
    payload.startTime,
    payload.endTime,
    details,
    true
  )

  if (!ACTIVITY_STATUS_VALUES.includes(status)) {
    details.push(`Status must be one of: ${ACTIVITY_STATUS_VALUES.join(', ')}`)
  }

  if (details.length) {
    buildError(details)
  }

  return {
    title,
    description,
    location,
    start_time: startTime,
    end_time: endTime,
    capacity: Math.round(capacity),
    required_skills: requiredSkills,
    status
  }
}

export const validateActivityUpdate = (payload = {}) => {
  const details = []
  const patch = {}

  if (payload.title !== undefined) {
    const title = typeof payload.title === 'string' ? payload.title.trim() : ''
    if (title.length < 3) {
      details.push('Title must be at least 3 characters long.')
    } else {
      patch.title = title
    }
  }

  if (payload.description !== undefined) {
    const description =
      typeof payload.description === 'string'
        ? payload.description.trim()
        : ''
    if (description.length < 10) {
      details.push('Description must be at least 10 characters long.')
    } else {
      patch.description = description
    }
  }

  if (payload.capacity !== undefined) {
    const capacity = Number(payload.capacity)
    if (!Number.isFinite(capacity) || capacity < 1) {
      details.push('Capacity must be a positive number.')
    } else {
      patch.capacity = Math.round(capacity)
    }
  }

  if (payload.requiredSkills !== undefined) {
    patch.required_skills = normalizeSkills(payload.requiredSkills)
  }

  if (payload.location !== undefined) {
    const location = validateLocation(payload.location, details, false)
    if (location) {
      patch.location = location
    }
  }

  if (payload.status !== undefined) {
    const status = String(payload.status).toLowerCase()
    if (!ACTIVITY_STATUS_VALUES.includes(status)) {
      details.push(`Status must be one of: ${ACTIVITY_STATUS_VALUES.join(', ')}`)
    } else {
      patch.status = status
    }
  }

  if (payload.startTime !== undefined || payload.endTime !== undefined) {
    const { startTime, endTime } = validateActivityTimeRange(
      payload.startTime,
      payload.endTime,
      details,
      false
    )
    if (startTime) {
      patch.start_time = startTime
    }
    if (endTime) {
      patch.end_time = endTime
    }
  }

  if (Object.keys(patch).length === 0) {
    details.push('At least one field must be provided to update the activity.')
  }

  if (details.length) {
    buildError(details)
  }

  return patch
}

export const validateActivityFilters = (query = {}) => {
  const pagination = validatePagination(query)
  const status = typeof query.status === 'string' ? query.status.trim().toLowerCase() : ''

  if (status && !ACTIVITY_STATUS_VALUES.includes(status)) {
    buildError([`Status filter must be one of: ${ACTIVITY_STATUS_VALUES.join(', ')}`])
  }

  const organizerId =
    typeof query.organizerId === 'string' && query.organizerId.trim()
      ? validateUuid(query.organizerId.trim())
      : undefined

  return {
    ...pagination,
    status,
    organizerId
  }
}
