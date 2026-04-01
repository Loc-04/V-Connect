import { supabase } from '@/src/data/clients';
import { dayAvailabilityFromSlotKeys } from '@/src/features/availability/availability-schedule.model';
import type {
  CoreSkillOption,
  OrganizerManagedActivityItem,
  OrganizerProfileView,
  OrganizerTopStats,
  OrganizerRecommendedVolunteerItem,
  ProfileStats,
  ProfileRole,
  RecentParticipationItem,
  VolunteerProfileView,
} from '../types';

interface UserRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: ProfileRole;
  created_at: string;
}

interface VolunteerProfileRow {
  user_id: string;
  skills: string[] | null;
  interests: string[] | null;
  available_choices: string[] | null;
  total_hours: number | null;
  impact_score: number | null;
}

interface VolunteerProfileLiteRow {
  user_id: string;
  skills: string[] | null;
  available_choices: string[] | null;
}

interface ParticipationRow {
  id: string;
  activity_id: string | null;
  created_at: string;
  activities: {
    title: string;
    start_time: string;
    end_time: string;
    organizer_id: string | null;
    users: {
      full_name: string;
    } | null;
  } | null;
}

interface FeedbackRow {
  participation_id: string;
  rating: number;
}

interface CoreSkillRow {
  id: string;
  skill_name: string;
}

interface OrganizerActivityRow {
  id: string;
  title: string;
  capacity: number | null;
  status: string | null;
  created_at: string;
}

interface OrganizerParticipationCountRow {
  activity_id: string | null;
}

interface OrganizerParticipationRow {
  volunteer_id: string | null;
  status: string | null;
}

interface RecommendationSeedRow {
  volunteer_id: string | null;
  ai_match_score: number | null;
}

interface OrganizerVolunteerUserRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

function toRole(value: string): ProfileRole {
  if (value === 'admin' || value === 'organizer' || value === 'volunteer') {
    return value;
  }
  return 'volunteer';
}

function toMemberSince(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().getFullYear().toString();
  }
  return date.getFullYear().toString();
}

function formatDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatHoursLabel(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'N/A';
  }

  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const hours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
  return `${hours} Hours`;
}

function mapOrganizerActivityBadge(status: string | null): 'open' | 'closed' {
  return status === 'published' ? 'open' : 'closed';
}

function formatCompactCount(value: number): string {
  if (value < 1000) {
    return value.toString();
  }
  const compact = (value / 1000).toFixed(1);
  return `${compact.endsWith('.0') ? compact.slice(0, -2) : compact}k`;
}

export async function getCoreSkills(): Promise<CoreSkillOption[]> {
  const result = await supabase
    .from('core_skills')
    .select('id, skill_name')
    .order('skill_name', { ascending: true })
    .returns<CoreSkillRow[]>();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []).map((item) => ({
    id: item.id,
    skillName: item.skill_name,
  }));
}

export async function updateVolunteerSkills(userId: string, skills: string[]): Promise<void> {
  const normalized = Array.from(
    new Set(
      skills
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );

  const { error } = await supabase
    .from('volunteer_profiles')
    .update({
      skills: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getVolunteerProfile(userId: string): Promise<VolunteerProfileView | null> {
  const [userResult, profileResult] = await Promise.all([
    supabase.from('users').select('id, full_name, avatar_url, role, created_at').eq('id', userId).maybeSingle<UserRow>(),
    supabase
      .from('volunteer_profiles')
      .select('user_id, skills, interests, available_choices, total_hours, impact_score')
      .eq('user_id', userId)
      .maybeSingle<VolunteerProfileRow>(),
  ]);

  if (userResult.error) {
    throw new Error(userResult.error.message);
  }
  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }
  if (!userResult.data || !profileResult.data) {
    return null;
  }

  return {
    userId: userResult.data.id,
    fullName: userResult.data.full_name,
    avatarUrl: userResult.data.avatar_url,
    role: toRole(userResult.data.role),
    memberSince: toMemberSince(userResult.data.created_at),
    skills: profileResult.data.skills ?? [],
    interests: profileResult.data.interests ?? [],
    availability: {
      days: dayAvailabilityFromSlotKeys(profileResult.data.available_choices),
      note: null,
    },
  };
}

export async function getVolunteerStats(userId: string): Promise<ProfileStats> {
  const [profileResult, approvedCountResult, checkedInCountResult] = await Promise.all([
    supabase
      .from('volunteer_profiles')
      .select('total_hours, impact_score')
      .eq('user_id', userId)
      .maybeSingle<Pick<VolunteerProfileRow, 'total_hours' | 'impact_score'>>(),
    supabase
      .from('activity_participations')
      .select('id', { count: 'exact', head: true })
      .eq('volunteer_id', userId)
      .in('status', ['approved', 'checked_in']),
    supabase
      .from('activity_participations')
      .select('id', { count: 'exact', head: true })
      .eq('volunteer_id', userId)
      .eq('status', 'checked_in'),
  ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }
  if (approvedCountResult.error) {
    throw new Error(approvedCountResult.error.message);
  }
  if (checkedInCountResult.error) {
    throw new Error(checkedInCountResult.error.message);
  }

  const totalHours = profileResult.data?.total_hours ?? 0;
  const activitiesCount = approvedCountResult.count ?? 0;
  const checkedInCount = checkedInCountResult.count ?? 0;

  const derivedImpact =
    activitiesCount > 0 ? Math.round((checkedInCount / activitiesCount) * 100) : 0;
  const impactScore =
    typeof profileResult.data?.impact_score === 'number'
      ? Math.round(profileResult.data.impact_score)
      : derivedImpact;

  return {
    activitiesCount,
    totalHours,
    impactScore,
  };
}

export async function getRecentParticipations(
  userId: string,
  limit = 5,
): Promise<RecentParticipationItem[]> {
  const participationsResult = await supabase
    .from('activity_participations')
    .select(
      `
        id,
        activity_id,
        created_at,
        activities:activities (
          title,
          start_time,
          end_time,
          organizer_id,
          users:users!activities_organizer_id_fkey (
            full_name
          )
        )
      `,
    )
    .eq('volunteer_id', userId)
    .in('status', ['approved', 'checked_in'])
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<ParticipationRow[]>();

  if (participationsResult.error) {
    throw new Error(participationsResult.error.message);
  }

  const participationRows = participationsResult.data ?? [];
  if (participationRows.length === 0) {
    return [];
  }

  const participationIds = participationRows.map((item) => item.id);
  const feedbackResult = await supabase
    .from('participation_feedback')
    .select('participation_id, rating')
    .in('participation_id', participationIds)
    .returns<FeedbackRow[]>();

  if (feedbackResult.error) {
    throw new Error(feedbackResult.error.message);
  }

  const topRatedMap = new Map<string, boolean>();
  for (const row of feedbackResult.data ?? []) {
    topRatedMap.set(row.participation_id, row.rating >= 4);
  }

  return participationRows.map((item) => {
    const activity = item.activities;
    return {
      participationId: item.id,
      activityId: item.activity_id ?? '',
      title: activity?.title ?? 'Untitled activity',
      organizerName: activity?.users?.full_name ?? null,
      dateLabel: formatDateLabel(activity?.start_time ?? item.created_at),
      hoursLabel: activity?.start_time && activity?.end_time
        ? formatHoursLabel(activity.start_time, activity.end_time)
        : 'N/A',
      isTopRated: topRatedMap.get(item.id) === true,
    };
  });
}

export async function getOrganizerProfile(userId: string): Promise<OrganizerProfileView | null> {
  const result = await supabase
    .from('users')
    .select('id, full_name, avatar_url, role')
    .eq('id', userId)
    .maybeSingle<Pick<UserRow, 'id' | 'full_name' | 'avatar_url' | 'role'>>();

  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data) {
    return null;
  }

  return {
    userId: result.data.id,
    fullName: result.data.full_name,
    avatarUrl: result.data.avatar_url,
    role: toRole(result.data.role),
  };
}

export async function getOrganizerManagedActivities(
  organizerId: string,
  limit = 5,
): Promise<OrganizerManagedActivityItem[]> {
  const activitiesResult = await supabase
    .from('activities')
    .select('id, title, capacity, status, created_at')
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<OrganizerActivityRow[]>();

  if (activitiesResult.error) {
    throw new Error(activitiesResult.error.message);
  }

  const activities = activitiesResult.data ?? [];
  if (activities.length === 0) {
    return [];
  }

  const activityIds = activities.map((activity) => activity.id);
  const countsResult = await supabase
    .from('activity_participations')
    .select('activity_id')
    .in('activity_id', activityIds)
    .in('status', ['approved', 'checked_in'])
    .returns<OrganizerParticipationCountRow[]>();

  if (countsResult.error) {
    throw new Error(countsResult.error.message);
  }

  const joinedCountMap = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    if (!row.activity_id) continue;
    const prev = joinedCountMap.get(row.activity_id) ?? 0;
    joinedCountMap.set(row.activity_id, prev + 1);
  }

  return activities.map((activity) => ({
    activityId: activity.id,
    title: activity.title,
    joinedVolunteers: joinedCountMap.get(activity.id) ?? 0,
    capacity: activity.capacity ?? 0,
    badge: mapOrganizerActivityBadge(activity.status),
  }));
}

export async function getOrganizerTopStats(organizerId: string): Promise<OrganizerTopStats> {
  const activitiesCountResult = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('organizer_id', organizerId);

  if (activitiesCountResult.error) {
    throw new Error(activitiesCountResult.error.message);
  }

  const participationsResult = await supabase
    .from('activity_participations')
    .select(
      `
        volunteer_id,
        status,
        activities!inner (
          organizer_id
        )
      `,
    )
    .eq('activities.organizer_id', organizerId)
    .in('status', ['approved', 'checked_in'])
    .returns<OrganizerParticipationRow[]>();

  if (participationsResult.error) {
    throw new Error(participationsResult.error.message);
  }

  const totalEvents = activitiesCountResult.count ?? 0;
  const participations = participationsResult.data ?? [];
  const uniqueVolunteers = new Set<string>();
  let checkedInCount = 0;
  for (const row of participations) {
    if (row.volunteer_id) {
      uniqueVolunteers.add(row.volunteer_id);
    }
    if (row.status === 'checked_in') {
      checkedInCount += 1;
    }
  }

  const successRate =
    participations.length > 0 ? Math.round((checkedInCount / participations.length) * 100) : 0;

  return {
    totalEvents: totalEvents.toString(),
    volunteers: formatCompactCount(uniqueVolunteers.size),
    successRate: `${successRate}%`,
  };
}

export async function getOrganizerRecommendedVolunteers(
  organizerId: string,
  limit = 6,
): Promise<OrganizerRecommendedVolunteerItem[]> {
  const seedResult = await supabase
    .from('activity_participations')
    .select(
      `
        volunteer_id,
        ai_match_score,
        activities!inner (
          organizer_id
        )
      `,
    )
    .eq('activities.organizer_id', organizerId)
    .not('volunteer_id', 'is', null)
    .not('ai_match_score', 'is', null)
    .order('ai_match_score', { ascending: false })
    .limit(30)
    .returns<RecommendationSeedRow[]>();

  if (seedResult.error) {
    throw new Error(seedResult.error.message);
  }

  const scoredByUser = new Map<string, number>();
  for (const row of seedResult.data ?? []) {
    if (!row.volunteer_id || typeof row.ai_match_score !== 'number') continue;
    const prev = scoredByUser.get(row.volunteer_id);
    if (prev === undefined || row.ai_match_score > prev) {
      scoredByUser.set(row.volunteer_id, row.ai_match_score);
    }
  }

  const volunteerIds = Array.from(scoredByUser.keys()).slice(0, limit);
  if (volunteerIds.length === 0) {
    return [];
  }

  const [usersResult, profilesResult] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, avatar_url')
      .in('id', volunteerIds)
      .returns<OrganizerVolunteerUserRow[]>(),
    supabase
      .from('volunteer_profiles')
      .select('user_id, skills, available_choices')
      .in('user_id', volunteerIds)
      .returns<VolunteerProfileLiteRow[]>(),
  ]);

  if (usersResult.error) {
    throw new Error(usersResult.error.message);
  }
  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  const userMap = new Map<string, OrganizerVolunteerUserRow>();
  for (const user of usersResult.data ?? []) {
    userMap.set(user.id, user);
  }

  const profileMap = new Map<string, VolunteerProfileLiteRow>();
  for (const profile of profilesResult.data ?? []) {
    profileMap.set(profile.user_id, profile);
  }

  return volunteerIds
    .map((volunteerId) => {
      const user = userMap.get(volunteerId);
      if (!user) return null;

      const profile = profileMap.get(volunteerId);
      const rawScore = scoredByUser.get(volunteerId) ?? 0;
      const boundedScore = Math.max(0, Math.min(100, Math.round(rawScore * 100)));
      const tags = (profile?.skills ?? []).slice(0, 2);
      const slotCount = profile?.available_choices?.length ?? 0;
      const availabilityLabel = slotCount > 0 ? `${slotCount} time slots` : 'Available';

      return {
        userId: volunteerId,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        matchPercent: boundedScore,
        tags,
        availabilityLabel,
      };
    })
    .filter((item): item is OrganizerRecommendedVolunteerItem => item !== null);
}
