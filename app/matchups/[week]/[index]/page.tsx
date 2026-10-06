import { notFound } from 'next/navigation';
import { getMatchupDetailView, getWeekView } from '@/lib/mfl/view';
import MatchupDetailScreen from './MatchupDetailScreen';

/**
 * Matchup Detail. The week travels in the path so the back action returns to
 * the week the user drilled in from.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const { weeks } = await getWeekView(undefined);
  const params: Array<{ week: string; index: string }> = [];
  for (const { n } of weeks) {
    const { matchups } = await getWeekView(n);
    for (const m of matchups) params.push({ week: String(n), index: String(m.index) });
  }
  return params;
}

export default async function MatchupDetailPage({
  params,
}: {
  params: Promise<{ week: string; index: string }>;
}) {
  const { week, index } = await params;
  const view = await getMatchupDetailView(Number(week), Number(index));
  if (!view) notFound();
  return <MatchupDetailScreen view={view} />;
}
