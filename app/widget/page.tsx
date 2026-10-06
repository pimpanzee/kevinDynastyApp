import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import WidgetSetupScreen from './WidgetSetupScreen';

/**
 * Setup page for the Scriptable Home Screen widget (widget/). Copying a long
 * script from a file on a phone is fiddly, so the page carries the script,
 * read from the repo at build time, behind a one-tap Copy button.
 */
export default function WidgetPage() {
  const script = readFileSync(join(process.cwd(), 'widget', 'gridlock-widget.js'), 'utf8');
  return <WidgetSetupScreen script={script} />;
}
