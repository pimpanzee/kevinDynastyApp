import { NextResponse } from 'next/server';
import { getRosterView } from '@/lib/mfl/view';

/**
 * Roster relay. The franchise switcher swaps teams without leaving the page,
 * so it needs a fetchable endpoint — and MFL cannot be called from the browser
 * directly (MFL_API_CONTEXT.md §10), so the request comes through here.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const franchise = searchParams.get('franchise') ?? undefined;
  const now = searchParams.get('now');

  try {
    const view = await getRosterView(franchise, now);
    return NextResponse.json(view);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load roster';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
