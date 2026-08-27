import MatchupDetailScreen from './MatchupDetailScreen';

/**
 * Matchup Detail — the full boxscore for one game.
 *
 * The week travels in the path so the back action returns to the week the
 * user drilled in from. The design's back link was hardcoded to Week 11.
 */
export default async function MatchupDetailPage({
  params,
}: {
  params: Promise<{ week: string; index: string }>;
}) {
  const { week, index } = await params;
  return <MatchupDetailScreen week={Number(week)} index={Number(index)} />;
}
