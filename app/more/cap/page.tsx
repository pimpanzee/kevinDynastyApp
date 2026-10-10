import { getCapView } from '@/lib/cap';
import CapScreen from './CapScreen';

/** Every franchise's cap position side by side. */
export default async function CapPage() {
  return <CapScreen view={await getCapView()} />;
}
