import { notFound } from 'next/navigation';
import { getMatchupDetailView } from '@/lib/mfl/view';
import MatchupDetailScreen from './MatchupDetailScreen';

/**
 * Matchup Detail. The week travels in the path so the back action returns to
 * the week the user drilled in from.
 */
export const dynamic = 'force-dynamic';

export default async function MatchupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ week: string; index: string }>;
  searchParams: Promise<{ now?: string }>;
}) {
  const { week, index } = await params;
  const { now } = await searchParams;
  const view = await getMatchupDetailView(Number(week), Number(index), now);
  if (!view) notFound();
  return <MatchupDetailScreen view={view} nowOverride={now ?? null} />;
}
