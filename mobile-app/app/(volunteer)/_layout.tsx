import { Stack } from 'expo-router';

export default function VolunteerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="availability" options={{ headerShown: false }} />
      <Stack.Screen
        name="my-registrations"
        options={{ headerShown: true, title: 'My registrations', headerBackTitle: 'Back' }}
      />
      <Stack.Screen name="activity/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="activity/check-in" options={{ headerShown: false }} />
      <Stack.Screen name="organizer/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
