const userColumns = 'id, role, full_name, phone, avatar_url, status, created_at, updated_at, deleted_at';
const volunteerColumns = 'user_id, skills, interests, availability, total_hours, updated_at';
const activityColumns =
  'id, title, description, location, start_time, end_time, capacity, required_skills, status, organizer_id, created_at, updated_at, deleted_at';
const notificationColumns = 'id, user_id, title, message, type, data, created_at, read_at';
const participationColumns = '*';
const feedbackColumns = 'id, participation_id, volunteer_id, organizer_id, rating, comment, created_at';

const validRoles = new Set(['admin', 'organizer', 'volunteer']);
const validActivityStatuses = new Set(['draft', 'published', 'completed', 'cancelled']);
const validParticipationStatuses = new Set(['pending', 'approved', 'rejected', 'checked_in', 'cancelled']);
const activityWriteRoles = new Set(['admin', 'organizer']);
const feedbackEligibleParticipationStatuses = new Set(['approved', 'checked_in']);

export {
  userColumns,
  volunteerColumns,
  activityColumns,
  notificationColumns,
  participationColumns,
  feedbackColumns,
  validRoles,
  validActivityStatuses,
  validParticipationStatuses,
  activityWriteRoles,
  feedbackEligibleParticipationStatuses,
};
