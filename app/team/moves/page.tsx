import LineupScreen from '@/components/team/LineupScreen';
import { getLineupProps } from '@/lib/lineupProps';

/** Manage roster: move players to and from IR and the taxi squad, and drop them. */
export default async function Page() {
  return <LineupScreen mode="moves" {...await getLineupProps()} />;
}
