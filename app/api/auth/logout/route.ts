import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { guard, ok } from '@/lib/api/respond';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'logout' });
  if (!g.ok) return g.response;
  await clearSessionCookie();
  return ok({ deconnecte: true });
}
