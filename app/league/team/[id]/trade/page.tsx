import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/mfl/league';
import { getTeamsData } from '@/lib/team';
import { assetValues } from '@/lib/tradeValues';
import TradeScreen from './TradeScreen';

/** Propose a trade to one team. One page per franchise, like the team pages. */
export const dynamicParams = false;

export async function generateStaticParams() {
  const league = await getLeague();
  return league.franchises.map((f) => ({ id: f.id }));
}

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, league] = await Promise.all([getTeamsData(), getLeague()]);
  if (!data.teams.some((t) => t.id === id)) notFound();
  // A league that can start two QBs prices them like a superflex league.
  const superflex = (league.lineup.positions.QB?.max ?? 1) >= 2;
  const values = await assetValues(data, superflex);
  return <TradeScreen data={data} teamId={id} values={values} />;
}
