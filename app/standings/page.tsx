import { getStandingsView } from '@/lib/mfl/view';
import StandingsScreen from './StandingsScreen';

/** League standings, grouped by conference and division. */
export const dynamic = 'force-dynamic';

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ now?: string }>;
}) {
  const { now } = await searchParams;
  const view = await getStandingsView(now);
  return <StandingsScreen view={view} />;
}
