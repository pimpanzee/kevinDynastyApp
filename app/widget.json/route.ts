import { NextResponse } from 'next/server';
import { getWidgetContext } from '@/lib/mfl/view';

/** Static context for the live relay's Home Screen widget feed (worker/). */
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(await getWidgetContext());
}
