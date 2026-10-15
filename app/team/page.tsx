import { getRosterView } from '@/lib/mfl/view';
import RostersScreen from './RostersScreen';

/** Rosters. Opens on the user's own franchise (MFL_API_CONTEXT.md §9). */
export default async function RostersPage() {
  const view = await getRosterView(undefined);
  return <RostersScreen initial={view} />;
}
