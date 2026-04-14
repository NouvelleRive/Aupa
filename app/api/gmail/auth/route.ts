import { NextResponse } from 'next/server';
import { getOAuth2Client, SCOPES } from '@/lib/googleAuth';

export async function GET() {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  return NextResponse.redirect(url);
}
