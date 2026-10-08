import { NextResponse } from 'next/server';
import { getPlayerCard, getPlayerCardIds } from '@/lib/playerCard';

/**
 * One player card's data per file, written at build time and fetched when
 * the card opens (MFL can't be called from the browser).
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getPlayerCardIds()).map((id) => ({ id }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await getPlayerCard(id));
}
