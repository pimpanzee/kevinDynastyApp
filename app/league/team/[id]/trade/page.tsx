import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/mfl/league';
import { getTitleEquity } from '@/lib/mfl/playoffOdds';
import { getSeasonTotals } from '@/lib/seasonTotals';
import { getTeamsData } from '@/lib/team';
import TradeScreen from './TradeScreen';

/** Propose a trade to one team. One page per franchise, like the team pages. */
export const dynamicParams = false;

export async function generateStaticParams() {
  const league = await getLeague();
  return league.franchises.map((f) => ({ id: f.id }));
}

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, league, { done }] = await Promise.all([getTeamsData(), getLeague(), getSeasonTotals()]);
  if (!data.teams.some((t) => t.id === id)) notFound();
  // Title equity: what lineup points are worth in odds and winnings this season.
  const equity = await getTitleEquity(league, done);
  return <TradeScreen data={data} teamId={id} equity={equity} />;
}
