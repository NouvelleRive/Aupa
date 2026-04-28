import { NextRequest, NextResponse } from 'next/server';
import { canAccessPath, directeurHomePath } from '@/lib/roles';

const PUBLIC_PATHS = new Set([
  '/login',
  '/api/login',
  '/api/gmail/callback',
]);

function parseUsers(raw: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!raw) return m;
  for (const pair of raw.split(',')) {
    const [name, pwd] = pair.split(':');
    if (name && pwd) m.set(name.trim().toLowerCase(), pwd.trim());
  }
  return m;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/api/gmail/sync') {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${process.env.CRON_SECRET}`) return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const users = parseUsers(process.env.APP_USERS);
  const name = req.cookies.get('aupa_user')?.value?.toLowerCase();
  const token = req.cookies.get('aupa_token')?.value;
  if (name && token && users.get(name) === token) {
    if (!canAccessPath(name, pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = directeurHomePath();
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
