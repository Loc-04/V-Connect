export const ACTIVITY_TABLE = 'activities'

export const ACTIVITY_STATUSES = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
}

export const ACTIVITY_STATUS_VALUES = Object.values(ACTIVITY_STATUSES)

export const ACTIVITY_PUBLIC_FIELDS = [
  'id',
  'title',
  'description',
  'location',
  'start_time',
  'end_time',
  'capacity',
  'required_skills',
  'status',
  'organizer_id',
  'created_at',
  'updated_at'
].join(', ')

export const sanitizeActivity = (row) => {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    requiredSkills: row.required_skills,
    status: row.status,
    organizerId: row.organizer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
