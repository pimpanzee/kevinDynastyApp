import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/mfl/league';
import { getTeamsData } from '@/lib/team';
import TeamPageScreen from './TeamPageScreen';

/** Another team's page, opened from Standings or Ratings. One page per franchise. */
export const dynamicParams = false;

export async function generateStaticParams() {
  const league = await getLeague();
  return league.franchises.map((f) => ({ id: f.id }));
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getTeamsData();
  if (!data.teams.some((t) => t.id === id)) notFound();
  return <TeamPageScreen data={data} teamId={id} />;
}
