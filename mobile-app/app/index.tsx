import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { getHomeRouteForRole, useAuth } from '@/src/features/auth';
import { ROUTES } from '@/src/shared/constants/route-constants';

export default function IndexRoute() {
  const { status, role } = useAuth();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (status === 'authenticated' && role) {
    return <Redirect href={getHomeRouteForRole(role) as never} />;
  }

  return <Redirect href={ROUTES.AUTH.LOGIN as never} />;
}
