import { getWeekView } from '@/lib/mfl/view';
import MatchupsScreen from './MatchupsScreen';

/**
 * Weekly Matchups. Data is fetched on the server — MFL blocks cross-domain
 * browser access, so every read has to originate here rather than in the
 * client bundle (MFL_API_CONTEXT.md §10).
 */
export const dynamic = 'force-dynamic';

export default async function MatchupsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; now?: string }>;
}) {
  const { week, now } = await searchParams;
  const view = await getWeekView(week ? Number(week) : undefined, now);
  return <MatchupsScreen view={view} nowOverride={now ?? null} />;
}
