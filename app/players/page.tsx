import { getTeamsData } from '@/lib/team';
import PlayersScreen from './PlayersScreen';

/**
 * League player browser. The data is a static file built alongside the page
 * (/players.json) and loaded in the browser, so the page itself stays light.
 * The cap, roster limit and cap adjustments are for blind bid claims.
 */
export default async function PlayersPage() {
  const data = await getTeamsData();
  const adj = Object.fromEntries(data.teams.map((t) => [t.id, t.adj]));
  return <PlayersScreen rules={{ cap: data.cap, limits: data.limits, adj }} />;
}
