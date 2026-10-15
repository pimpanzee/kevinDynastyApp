import TeamScreen from '@/components/team/TeamScreen';
import { getTeamsData } from '@/lib/team';

/** My team — roster. Every team is built; the viewer's pick is shown (lib/myTeam.ts). */
export default async function Page() {
  return <TeamScreen data={await getTeamsData()} tab="roster" />;
}
