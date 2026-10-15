import LineupScreen from '@/components/team/LineupScreen';
import { getLineupProps } from '@/lib/lineupProps';

/** Move players to and from IR and the taxi squad. */
export default async function Page() {
  return <LineupScreen mode="moves" {...await getLineupProps()} />;
}
