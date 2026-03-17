import { supabase } from '@/src/data/clients';
import type {
  AvailabilityMap,
  CoreSkillOption,
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
  availability: unknown;
  availability_note: string | null;
  total_hours: number | null;
  impact_score: number | null;
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

const DEFAULT_AVAILABILITY: AvailabilityMap = {
  mon: false,
  tue: false,
  wed: false,
  thu: false,
  fri: false,
  sat: false,
  sun: false,
};

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

function normalizeAvailability(raw: unknown): AvailabilityMap {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AVAILABILITY };
  }

  const obj = raw as Record<string, unknown>;
  const hasDailyKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].some(
    (key) => typeof obj[key] === 'boolean',
  );

  if (hasDailyKeys) {
    return {
      mon: obj.mon === true,
      tue: obj.tue === true,
      wed: obj.wed === true,
      thu: obj.thu === true,
      fri: obj.fri === true,
      sat: obj.sat === true,
      sun: obj.sun === true,
    };
  }

  const weekdays = obj.weekdays === true;
  const weekends = obj.weekends === true;
  return {
    mon: weekdays,
    tue: weekdays,
    wed: weekdays,
    thu: weekdays,
    fri: weekdays,
    sat: weekends,
    sun: weekends,
  };
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
      .select('user_id, skills, interests, availability, availability_note, total_hours, impact_score')
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
      days: normalizeAvailability(profileResult.data.availability),
      note: profileResult.data.availability_note,
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
