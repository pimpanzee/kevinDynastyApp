import { FRANCHISE_ID } from '@/lib/config';
import { getLeague } from '@/lib/mfl/league';
import { getStandingsView } from '@/lib/mfl/view';
import SettingsScreen from './SettingsScreen';

/** Settings: pick your team, appearance, the install and widget guides. */
export default async function SettingsPage() {
  const [league, standings] = await Promise.all([getLeague(), getStandingsView()]);
  const record = new Map(standings.groups.flatMap((g) => g.teams.map((t) => [t.franchiseId, t.record.replace(/-0$/, '')])));
  const division = new Map(league.groups.flatMap((g) => g.franchiseIds.map((id) => [id, g.division])));
  const franchises = league.franchises
    .map((f) => ({ id: f.id, name: f.name, icon: f.icon ?? null, sub: [record.get(f.id), division.get(f.id)].filter(Boolean).join(' · ') }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <SettingsScreen franchises={franchises} defaultTeam={FRANCHISE_ID} />;
}
