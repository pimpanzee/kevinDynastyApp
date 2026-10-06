import { getWeekView } from '@/lib/mfl/view';
import MatchupsScreen from './MatchupsScreen';

/**
 * Weekly Matchups, opening on the current week. Data is fetched at build time —
 * MFL blocks cross-domain browser access, so every read has to happen on the
 * server rather than in the client bundle (MFL_API_CONTEXT.md §10).
 */
export default async function MatchupsPage() {
  const view = await getWeekView(undefined);
  return <MatchupsScreen view={view} />;
}
