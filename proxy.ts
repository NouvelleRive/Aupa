import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = new Set([
  '/login',
  '/api/login',
  '/api/gmail/callback', // Google redirige ici après consent
]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cron Vercel : vérifie le header d'autorisation avec CRON_SECRET
  if (pathname === '/api/gmail/sync') {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${process.env.CRON_SECRET}`) return NextResponse.next();
    // Sinon laisser passer si l'utilisateur est loggué (déclenchement manuel)
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const cookie = req.cookies.get('aupa_auth')?.value;
  if (cookie && cookie === process.env.APP_PASSWORD) return NextResponse.next();

  // Pas authentifié : rediriger vers /login
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Exclure les assets statiques et _next/
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
