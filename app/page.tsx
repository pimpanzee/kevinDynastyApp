import { redirect } from 'next/navigation';

/** The app opens on the current week's matchups. */
export default function Home() {
  redirect('/matchups');
}
