import LineupScreen from '@/components/team/LineupScreen';
import { getLineupProps } from '@/lib/lineupProps';

/** Set this week's lineup. */
export default async function Page() {
  return <LineupScreen mode="lineup" {...await getLineupProps()} />;
}
