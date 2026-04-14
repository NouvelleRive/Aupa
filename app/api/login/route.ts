import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

function parseUsers(raw: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!raw) return m;
  for (const pair of raw.split(',')) {
    const [name, pwd] = pair.split(':');
    if (name && pwd) m.set(name.trim().toLowerCase(), pwd.trim());
  }
  return m;
}

export async function POST(req: NextRequest) {
  const { name, password } = await req.json();
  const cleanName = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!cleanName || !password) return NextResponse.json({ ok: false }, { status: 400 });

  const users = parseUsers(process.env.APP_USERS);
  if (users.get(cleanName) !== password) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Log la connexion (best-effort, ne bloque pas en cas d'erreur)
  try {
    await addDoc(collection(db, 'logins'), {
      user: cleanName,
      at: new Date().toISOString(),
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
      ua: req.headers.get('user-agent') || null,
    });
  } catch {}

  const res = NextResponse.json({ ok: true });
  const opts = { httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 30, path: '/' };
  res.cookies.set('aupa_user', cleanName, opts);
  res.cookies.set('aupa_token', password, opts);
  return res;
}
