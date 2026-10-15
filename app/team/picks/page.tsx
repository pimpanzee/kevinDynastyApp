import { getPickBoard } from '@/lib/cap';
import PicksScreen from './PicksScreen';

/** Who holds every future draft pick. */
export default async function PicksPage() {
  return <PicksScreen view={await getPickBoard()} />;
}
