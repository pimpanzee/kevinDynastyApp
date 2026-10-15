import LineupScreen, { type LineupPlayer } from '@/components/team/LineupScreen';
import { getPlayerDetails } from '@/lib/mfl/players';
import { getPlayersData } from '@/lib/players';
import { getStartPercents } from '@/lib/stats/espn';
import { getTeamsData } from '@/lib/team';

/**
 * Set your lineup and make IR and taxi moves. Rosters and starters are read
 * live from MFL through the write relay when the screen opens; the build
 * supplies everything else about every rostered player: name, position,
 * injury, opponent, projection, points per game and ESPN's start %.
 */
export default async function Page() {
  const [data, playersData, details] = await Promise.all([getTeamsData(), getPlayersData(), getPlayerDetails()]);
  const rostered = playersData.players.filter((p) => p.owner);
  const started = await getStartPercents(rostered.map((p) => details.get(p.id)?.espnId ?? ''));

  const players: Record<string, LineupPlayer> = {};
  for (const p of rostered) {
    const espnId = details.get(p.id)?.espnId;
    players[p.id] = {
      name: p.name,
      pos: p.pos,
      team: p.nflTeam,
      injury: p.injury,
      opp: p.next?.opp ?? null,
      proj: p.proj.pts,
      ppg: p.season.gp ? p.season.pts / p.season.gp : null,
      startPct: espnId ? started[espnId] ?? null : null,
    };
  }
  // Anyone the players list leaves out (it skips NFL free agents) still gets a name.
  for (const t of data.teams) {
    for (const p of t.roster) players[p.id] ??= { name: p.name, pos: p.pos, team: p.team, injury: p.injury };
  }
  return <LineupScreen players={players} projWeek={playersData.projWeek} rules={data.lineup} limits={data.limits} />;
}
