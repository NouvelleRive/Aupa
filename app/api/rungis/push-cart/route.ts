import { NextResponse } from 'next/server';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BASE = 'https://rungismarket.com';

function mergeCookies(...batches: string[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const batch of batches) {
    for (const c of batch) {
      const [kv] = c.split(';');
      const eq = kv.indexOf('=');
      if (eq < 0) continue;
      const name = kv.slice(0, eq).trim();
      const value = kv.slice(eq + 1).trim();
      if (value && value !== 'deleted') map.set(name, value);
    }
  }
  return map;
}

function cookiesToHeader(map: Map<string, string>): string {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function login(): Promise<string | null> {
  const email = process.env.RUNGIS_EMAIL;
  const password = process.env.RUNGIS_PASSWORD;
  if (!email || !password) return null;

  const loginPage = await fetch(`${BASE}/connexion`, { redirect: 'manual' });
  const cookies1 = (loginPage.headers as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  const html = await loginPage.text();
  const tokenMatch = html.match(/name="_token"[^>]*value="([^"]+)"/);
  if (!tokenMatch) return null;
  let cookieMap = mergeCookies(cookies1);

  const body = new URLSearchParams({
    email,
    plainPassword: password,
    _token: tokenMatch[1],
    _remember_me: '1',
  });
  const res = await fetch(`${BASE}/connexion`, {
    method: 'POST',
    headers: { cookie: cookiesToHeader(cookieMap), 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });
  const cookies2 = (res.headers as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  cookieMap = mergeCookies(cookies1, cookies2);

  // Suivre le 302 vers /app pour récupérer les cookies de session finaux
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location') || '/app';
    const followUrl = loc.startsWith('http') ? loc : `${BASE}${loc}`;
    const r2 = await fetch(followUrl, { headers: { cookie: cookiesToHeader(cookieMap) }, redirect: 'manual' });
    const cookies3 = (r2.headers as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
    cookieMap = mergeCookies(cookies1, cookies2, cookies3);
  }
  return cookiesToHeader(cookieMap);
}

async function getApiToken(cookie: string): Promise<string | null> {
  const res = await fetch(`${BASE}/app`, { headers: { cookie } });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/"apiToken":"([^"]+)"/);
  return m ? m[1] : null;
}

async function setCart(cookie: string, apiToken: string, items: { product_id: number; quantity: number }[]): Promise<{ ok: boolean; error?: string }> {
  const url = `${BASE}/app/cart/set?submitType=UPDATE`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      cookie,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ __data: items, __token: apiToken }),
  });
  if (res.status >= 200 && res.status < 300) return { ok: true };
  const text = await res.text();
  let msg = text;
  try { msg = JSON.parse(text).message || msg; } catch { /* keep raw */ }
  return { ok: false, error: msg };
}

function extractProductId(pf: { rungisProductId?: string | number; url?: string } | undefined, panierUrl?: string): number | null {
  if (pf?.rungisProductId) {
    const idStr = String(pf.rungisProductId).split('/')[0];
    const n = parseInt(idStr);
    if (!isNaN(n)) return n;
  }
  const url = pf?.url || panierUrl;
  if (url) {
    const m = url.match(/\/app\/product\/(\d+)/);
    if (m) return parseInt(m[1]);
  }
  return null;
}

export async function POST() {
  try {
    const cookie = await login();
    if (!cookie) return NextResponse.json({ ok: false, error: 'Login Rungis échoué' }, { status: 500 });

    const apiToken = await getApiToken(cookie);
    if (!apiToken) return NextResponse.json({ ok: false, error: 'apiToken Rungis introuvable' }, { status: 500 });

    // Charger panier (Rungis only)
    const panierSnap = await getDocs(collection(db, 'panier'));
    const items = panierSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as { id: string; pfId: string; pfNom: string; fournisseur: string; quantite: number; url?: string }))
      .filter(i => i.fournisseur === 'Rungis');
    if (items.length === 0) return NextResponse.json({ ok: false, error: 'Aucun produit Rungis dans le panier' }, { status: 400 });

    const cartItems: { product_id: number; quantity: number }[] = [];
    const missing: string[] = [];

    for (const item of items) {
      const pfDoc = await getDoc(doc(db, 'produitsFournisseurs', item.pfId));
      const pf = pfDoc.data() as { rungisProductId?: string | number; url?: string } | undefined;
      const pid = extractProductId(pf, item.url);
      if (!pid) { missing.push(`${item.pfNom} (productId introuvable)`); continue; }
      cartItems.push({ product_id: pid, quantity: item.quantite || 1 });
    }

    if (cartItems.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucun produit avec un Rungis productId valide', missing }, { status: 400 });
    }

    const result = await setCart(cookie, apiToken, cartItems);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, missing }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pushed: cartItems.length, total: items.length, missing });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
