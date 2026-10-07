import { NextResponse } from 'next/server';
import { getPlayersData } from '@/lib/players';

/** Every QB/RB/WR/TE with availability, injuries, games and stats — loaded by the Players screen. */
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(await getPlayersData());
}
