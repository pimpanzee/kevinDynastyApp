import { NextResponse } from 'next/server';
import { getTransactionsData } from '@/lib/transactions';

/** The season's in-season roster moves, newest first — loaded by the Transactions screen. */
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(await getTransactionsData());
}
