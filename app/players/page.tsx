import PlayersScreen from './PlayersScreen';

/**
 * League player browser. The data is a static file built alongside the page
 * (/players.json) and loaded in the browser, so the page itself stays light.
 */
export default function PlayersPage() {
  return <PlayersScreen />;
}
