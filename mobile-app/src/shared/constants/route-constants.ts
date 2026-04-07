export const ROUTES = {
  AUTH: {
    LOGIN: '/(auth)/login',
    REGISTER: '/(auth)/register',
  },
  VOLUNTEER: {
    HOME: '/(volunteer)/(tabs)/home',
    ACTIVITIES: '/(volunteer)/(tabs)/activities',
    MY_ACTIVITIES: '/(volunteer)/(tabs)/my-activities',
    NOTIFICATIONS: '/(volunteer)/(tabs)/notifications',
    PROFILE: '/(volunteer)/(tabs)/profile',
    AVAILABILITY: '/(volunteer)/availability',
    MY_REGISTRATIONS: '/(volunteer)/my-registrations',
    ACTIVITY_DETAIL: '/(volunteer)/activity',
    ACTIVITY_CHECK_IN: '/(volunteer)/activity/check-in',
  },
  ORGANIZER: {
    HOME: '/(organizer)/(tabs)/home',
    EVENTS: '/(organizer)/(tabs)/events',
    PROFILE: '/(organizer)/(tabs)/profile',
    ACTIVITY_MANAGEMENT: '/(organizer)/activity-management',
    REGISTER_MANAGEMENT: '/(organizer)/register-management',
    ACTIVITY_NEW: '/(organizer)/activity/new',
    ACTIVITY_DETAIL: '/(organizer)/activity/[id]',
  },
} as const;

export const DEEP_LINKS = {
  ACTIVITY: 'vconnect://activity/:id',
  NOTIFICATIONS: 'vconnect://notifications',
} as const;
