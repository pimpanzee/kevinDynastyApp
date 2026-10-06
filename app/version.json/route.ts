import { NextResponse } from 'next/server';

/** The live build's id, for installed apps to compare against their own. */
export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID });
}
