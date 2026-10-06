import { NextResponse } from 'next/server';
import { getRosterView } from '@/lib/mfl/view';

/**
 * Roster data, one JSON file per franchise. The franchise switcher swaps teams
 * without leaving the page, so it needs something fetchable — and MFL cannot
 * be called from the browser directly (MFL_API_CONTEXT.md §10), so every
 * roster is written out at build time instead.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const { franchises } = await getRosterView(undefined);
  return franchises.map((f) => ({ franchise: f.id }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ franchise: string }> }) {
  const { franchise } = await params;
  return NextResponse.json(await getRosterView(franchise));
}
