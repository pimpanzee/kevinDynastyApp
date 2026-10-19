import { getLeague } from '@/lib/mfl/league';
import { getTeamsData } from '@/lib/team';
import { assetValues } from '@/lib/tradeValues';
import TradesScreen from './TradesScreen';

/** Trade offers waiting on an answer: ones you sent, ones sent to you. Read live from MFL through the relay. */
export default async function Page() {
  const [data, league] = await Promise.all([getTeamsData(), getLeague()]);
  const superflex = (league.lineup.positions.QB?.max ?? 1) >= 2;
  return <TradesScreen data={data} values={await assetValues(data, superflex)} />;
}
