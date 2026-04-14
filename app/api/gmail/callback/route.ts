import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/googleAuth';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (tokens.refresh_token) {
    await setDoc(doc(db, 'config', 'gmail'), {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  return NextResponse.redirect(new URL('/menus?gmail=connected', request.url));
}
