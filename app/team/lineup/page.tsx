import LineupScreen, { type LineupPlayer } from '@/components/team/LineupScreen';
import { getTeamsData } from '@/lib/team';

/**
 * Set your lineup and make IR and taxi moves. Rosters and starters are read
 * live from MFL through the write relay when the screen opens; the build only
 * supplies names, positions and injuries for every rostered player.
 */
export default async function Page() {
  const data = await getTeamsData();
  const players: Record<string, LineupPlayer> = {};
  for (const t of data.teams) {
    for (const p of t.roster) players[p.id] = { name: p.name, pos: p.pos, team: p.team, injury: p.injury };
  }
  return <LineupScreen players={players} rules={data.lineup} limits={data.limits} />;
}
