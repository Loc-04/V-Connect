import { Stack } from 'expo-router';

export default function OrganizerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="activity-management"
        options={{ headerShown: true, title: 'Activity Management' }}
      />
      <Stack.Screen
        name="register-management"
        options={{ headerShown: true, title: 'Register Management' }}
      />
      <Stack.Screen name="activity/new" options={{ headerShown: true, title: 'Create Activity' }} />
      <Stack.Screen name="activity/[id]" options={{ headerShown: true, title: 'Edit Activity' }} />
    </Stack>
  );
}
