import { getRosterView } from '@/lib/mfl/view';
import RostersScreen from './RostersScreen';

/** Rosters. Opens on the user's own franchise (MFL_API_CONTEXT.md §9). */
export const dynamic = 'force-dynamic';

export default async function RostersPage({
  searchParams,
}: {
  searchParams: Promise<{ now?: string }>;
}) {
  const { now } = await searchParams;
  const view = await getRosterView(undefined, now);
  return <RostersScreen initial={view} nowOverride={now ?? null} />;
}
