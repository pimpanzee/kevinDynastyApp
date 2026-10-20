import { getLeague } from '@/lib/mfl/league';
import RecapScreen from './RecapScreen';

/** League › Recap: the weekly recap, read from the relay in the browser. */
export default async function RecapPage() {
  const league = await getLeague();
  const franchises = league.franchises.map((f) => ({ id: f.id, name: f.name, icon: f.icon ?? null }));
  return <RecapScreen franchises={franchises} myFranchiseId={league.franchises.find((f) => f.isMine)?.id ?? ''} />;
}
