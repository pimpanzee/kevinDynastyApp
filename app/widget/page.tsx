import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FRANCHISE_ID } from '@/lib/config';
import { getLeague } from '@/lib/mfl/league';
import WidgetSetupScreen from './WidgetSetupScreen';

/**
 * Setup page for the Scriptable Home Screen widget (widget/). Copying a long
 * script from a file on a phone is fiddly, so the page carries the script,
 * read from the repo at build time, behind a one-tap Copy button.
 */
export default async function WidgetPage() {
  const script = readFileSync(join(process.cwd(), 'widget', 'gridlock-widget.js'), 'utf8');
  const league = await getLeague();
  const franchises = league.franchises.map((f) => ({ id: f.id, name: f.name }));
  return <WidgetSetupScreen script={script} franchises={franchises} defaultTeam={FRANCHISE_ID} />;
}
