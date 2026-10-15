import { getRatingsView } from '@/lib/ratings';
import RatingsScreen from './RatingsScreen';

/** League › Ratings: this season's power rankings. */
export default async function RatingsPage() {
  return <RatingsScreen view={await getRatingsView()} />;
}
