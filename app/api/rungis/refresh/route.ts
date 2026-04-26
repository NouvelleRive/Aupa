import { NextResponse } from 'next/server';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function loginRungis(): Promise<string | null> {
  const email = process.env.RUNGIS_EMAIL;
  const password = process.env.RUNGIS_PASSWORD;
  if (!email || !password) return null;

  // Récupérer le token CSRF depuis la page de connexion
  const loginPage = await fetch('https://rungismarket.com/connexion', { redirect: 'manual' });
  const cookies1 = loginPage.headers.getSetCookie?.() || [];
  const html = await loginPage.text();
  const tokenMatch = html.match(/name="_token"[^>]*value="([^"]+)"/);
  if (!tokenMatch) return null;
  const token = tokenMatch[1];

  const sessionCookie = cookies1.map(c => c.split(';')[0]).join('; ');

  const body = new URLSearchParams({
    email,
    plainPassword: password,
    _token: token,
    _remember_me: '1',
  });

  const res = await fetch('https://rungismarket.com/connexion', {
    method: 'POST',
    headers: { 'cookie': sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });
  const cookies2 = res.headers.getSetCookie?.() || [];
  const allCookies = [...cookies1, ...cookies2].map(c => c.split(';')[0]).join('; ');
  return allCookies;
}

async function fetchRungisProduct(slug: string, cookie: string) {
  const url = `https://rungismarket.com/app/product/${slug}`;
  const res = await fetch(url, { headers: { 'cookie': cookie } });
  if (!res.ok) return null;
  const html = await res.text();
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
  const titleMatch = html.match(/<title>([^<|]+?)(?:\s*\|[^<]*)?<\/title>/);
  const nameMatch = ogTitleMatch || titleMatch;

  // Extract MAIN product price: locate the block with data-product-id="{slug}"
  // and pick the closest preceding product-main-price.
  const mainBtnIdx = html.search(new RegExp(`data-product-id="${slug}"[\\s\\S]{0,600}data-click-weight`));
  let prix = 0;
  let unite = 'kg';
  if (mainBtnIdx !== -1) {
    const before = html.slice(Math.max(0, mainBtnIdx - 1500), mainBtnIdx + 800);
    const priceMatches = [...before.matchAll(/product-main-price">\s*(\d+[,.]\d+)\s*€\s*\/\s*(kg|l|litre|pi[eè]ce|unit[eé])/gi)];
    const last = priceMatches[priceMatches.length - 1];
    if (last) {
      prix = parseFloat(last[1].replace(',', '.'));
      const u = last[2].toLowerCase();
      if (u.startsWith('kg')) unite = 'kg';
      else if (u.startsWith('l')) unite = 'L';
      else unite = 'pièce';
    }
  }
  // Fallback: first price on the page (legacy behaviour)
  if (!prix) {
    const kg = html.match(/(\d+[,.]\d+)\s*€\s*\/\s*kg/i);
    const l = html.match(/(\d+[,.]\d+)\s*€\s*\/\s*(?:l|litre)/i);
    const p = html.match(/(\d+[,.]\d+)\s*€\s*\/\s*(?:pi[eè]ce|unit[eé])/i);
    if (kg) { prix = parseFloat(kg[1].replace(',', '.')); unite = 'kg'; }
    else if (l) { prix = parseFloat(l[1].replace(',', '.')); unite = 'L'; }
    else if (p) { prix = parseFloat(p[1].replace(',', '.')); unite = 'pièce'; }
  }
  if (!prix) return null;

  return {
    nom: nameMatch?.[1]?.trim() || slug,
    prix,
    unite,
    quantite: 1,
    url,
  };
}

export async function POST() {
  try {
    const cookie = await loginRungis();
    if (!cookie) return NextResponse.json({ ok: false, error: 'Login Rungis échoué (creds manquantes ou invalides)' }, { status: 500 });

    const ingSnap = await getDocs(collection(db, 'ingredients'));
    const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));

    const ingsAvec = ingSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as { nom: string; rungisProductId?: string }) }))
      .filter(i => i.rungisProductId);

    if (ingsAvec.length === 0) {
      return NextResponse.json({ ok: true, message: 'Aucun ingrédient avec rungisProductId', updated: 0, created: 0 });
    }

    let updated = 0, created = 0;
    const errors: string[] = [];

    for (const ing of ingsAvec) {
      try {
        const data = await fetchRungisProduct(ing.rungisProductId!, cookie);
        if (!data) { errors.push(`${ing.nom}: prix non trouvé`); continue; }

        const existing = pfSnap.docs.find(d => {
          const p = d.data() as { fournisseur?: string; ingredientId?: string };
          return p.fournisseur === 'Rungis' && p.ingredientId === ing.id;
        });

        const pfData = {
          fournisseur: 'Rungis',
          ingredientId: ing.id,
          ingredient: ing.nom,
          nom: data.nom,
          prix: data.prix,
          unite: data.unite,
          quantite: data.quantite,
          url: data.url,
          updatedAt: new Date().toISOString(),
        };

        if (existing) {
          await updateDoc(doc(db, 'produitsFournisseurs', existing.id), pfData);
          updated++;
        } else {
          await addDoc(collection(db, 'produitsFournisseurs'), pfData);
          created++;
        }
      } catch (e: unknown) {
        errors.push(`${ing.nom}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({ ok: true, total: ingsAvec.length, updated, created, errors });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
