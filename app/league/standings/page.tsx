import { getStandingsView } from '@/lib/mfl/view';
import StandingsScreen from './StandingsScreen';

/** League standings, grouped by conference and division. */
export default async function StandingsPage() {
  const view = await getStandingsView();
  return <StandingsScreen view={view} />;
}
