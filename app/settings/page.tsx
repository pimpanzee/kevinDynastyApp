import { FRANCHISE_ID } from '@/lib/config';
import { getLeague } from '@/lib/mfl/league';
import SettingsScreen from './SettingsScreen';

/** Settings: pick your team, plus the install and widget guides. */
export default async function SettingsPage() {
  const league = await getLeague();
  const franchises = league.franchises.map((f) => ({ id: f.id, name: f.name, icon: f.icon ?? null }));
  return <SettingsScreen franchises={franchises} defaultTeam={FRANCHISE_ID} />;
}
