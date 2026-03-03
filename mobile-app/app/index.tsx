import { Redirect } from 'expo-router';

import { ROUTES } from '@/src/shared/constants/route-constants';

export default function IndexRoute() {
  return <Redirect href={ROUTES.AUTH.LOGIN as never} />;
}
