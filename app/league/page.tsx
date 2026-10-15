import TransactionsScreen from './TransactionsScreen';

/**
 * The league's in-season moves. The data is a static file built alongside the
 * page (/transactions.json) and loaded in the browser, like the Players screen.
 */
export default function TransactionsPage() {
  return <TransactionsScreen />;
}
