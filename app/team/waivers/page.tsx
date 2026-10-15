import WaiversScreen from '@/components/team/WaiversScreen';
import { getTeamsData } from '@/lib/team';

/**
 * Blind bid claims and drops. Free agents, your claims and your roster are
 * read live from MFL through the write relay; the build supplies the cap,
 * roster limits and each team's cap adjustments.
 */
export default async function Page() {
  const data = await getTeamsData();
  const adj = Object.fromEntries(data.teams.map((t) => [t.id, t.adj]));
  return <WaiversScreen cap={data.cap} limits={data.limits} adj={adj} />;
}
