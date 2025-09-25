import { NextResponse } from 'next/server'

// This route is no longer used because Vercel serverless is read-only.
// Zipping is performed on the client using JSZip.
export async function POST() {
  return NextResponse.json({ error: 'ZIP generation moved client-side' }, { status: 410 })
}


