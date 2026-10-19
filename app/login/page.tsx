import { getLeague } from '@/lib/mfl/league';
import LoginScreen from './LoginScreen';

/** Sign in with MFL: lets an owner make moves for their own team from the app. */
export default async function LoginPage() {
  const league = await getLeague();
  const franchises = league.franchises.map((f) => ({ id: f.id, name: f.name, icon: f.icon ?? null }));
  return <LoginScreen franchises={franchises} />;
}
