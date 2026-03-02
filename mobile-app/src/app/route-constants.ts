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
    ACTIVITY_DETAIL: '/(volunteer)/activity',
    ACTIVITY_CHECK_IN: '/(volunteer)/activity/check-in',
  },
  ORGANIZER: {
    DASHBOARD: '/(organizer)/dashboard',
  },
} as const;

export const DEEP_LINKS = {
  ACTIVITY: 'vconnect://activity/:id',
  NOTIFICATIONS: 'vconnect://notifications',
} as const;
