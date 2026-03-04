export const USER_TABLE = 'users'

export const USER_ROLES = {
  VOLUNTEER: 'volunteer',
  ORGANIZER: 'organizer',
  ADMIN: 'admin'
}

export const ROLE_VALUES = Object.values(USER_ROLES)

export const USER_PUBLIC_FIELDS = 'id, email, full_name, role, created_at, updated_at'

export const sanitizeUser = (row) => {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
