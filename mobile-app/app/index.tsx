import { Redirect } from 'expo-router';

import { useAuth } from '@/src/features/auth';
import { ROUTES } from '@/src/shared/constants/route-constants';

export default function IndexRoute() {
  const { status } = useAuth();

  if (status === 'authenticated') {
    return <Redirect href={ROUTES.VOLUNTEER.HOME as never} />;
  }

  return <Redirect href={ROUTES.AUTH.LOGIN as never} />;
}
