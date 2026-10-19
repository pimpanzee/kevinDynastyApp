import { getTeamsData } from '@/lib/team';
import TradesScreen from './TradesScreen';

/** Trade offers waiting on an answer: ones you sent, ones sent to you. Read live from MFL through the relay. */
export default async function Page() {
  return <TradesScreen data={await getTeamsData()} />;
}
