import { notFound } from 'next/navigation';
import { getWeekView } from '@/lib/mfl/view';
import MatchupsScreen from '../MatchupsScreen';

/** One page per week the picker offers. */
export const dynamicParams = false;

export async function generateStaticParams() {
  const { weeks } = await getWeekView(undefined);
  return weeks.map((w) => ({ week: String(w.n) }));
}

export default async function WeekMatchupsPage({ params }: { params: Promise<{ week: string }> }) {
  const week = Number((await params).week);
  if (!Number.isInteger(week)) notFound();
  const view = await getWeekView(week);
  return <MatchupsScreen view={view} />;
}
