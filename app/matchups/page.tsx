import { Suspense } from 'react';
import MatchupsScreen from './MatchupsScreen';

/**
 * Weekly Matchups. One screen, three data states — the week picker selects
 * which, and the phase (pre / live / final) follows from the week's status.
 */
export default function MatchupsPage() {
  return (
    <Suspense fallback={null}>
      <MatchupsScreen />
    </Suspense>
  );
}
