import { NextResponse } from 'next/server';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function loginRungis(): Promise<string | null> {
  const email = process.env.RUNGIS_EMAIL;
  const password = process.env.RUNGIS_PASSWORD;
  if (!email || !password) return null;

  const loginPage = await fetch('https://rungismarket.com/connexion', { redirect: 'manual' });
  const cookies1 = loginPage.headers.getSetCookie?.() || [];
  const html = await loginPage.text();
  const tokenMatch = html.match(/name="_token"[^>]*value="([^"]+)"/);
  if (!tokenMatch) return null;
  const token = tokenMatch[1];
  const sessionCookie = cookies1.map(c => c.split(';')[0]).join('; ');

  const body = new URLSearchParams({ email, plainPassword: password, _token: token, _remember_me: '1' });
  const res = await fetch('https://rungismarket.com/connexion', {
    method: 'POST',
    headers: { 'cookie': sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });
  const cookies2 = res.headers.getSetCookie?.() || [];
  return [...cookies1, ...cookies2].map(c => c.split(';')[0]).join('; ');
}

type RungisHit = {
  productId: string;
  slug: string;
  nom: string;
  weightKg: number;
  priceCents: number;
  pricePerKg: number;
  isLiquid: boolean;
  theme: string;
  format: string;
};

function parseSearchResults(html: string): RungisHit[] {
  const hits: RungisHit[] = [];
  const cards = html.split(/<div class="card product-box/);
  for (const card of cards.slice(1)) {
    const productIdM = card.match(/data-product-id="(\d+)"/);
    const weightM = card.match(/data-click-weight="([\d.]+)"/);
    const priceM = card.match(/data-click-price="(\d+)"/);
    const liquidM = card.match(/data-click-is-liquid="(\d)"/);
    const themeM = card.match(/data-modal-theme="([^"]+)"/);
    const slugM = card.match(/href="\/app\/product\/(\d+\/[^"#?]+)"/);
    const nameM = card.match(/<div class="card-title[^"]*">([^<]+)<\/div>/);
    const subM = card.match(/<p class="card-subtitle[^"]*">([\s\S]*?)<\/p>/);
    if (!productIdM || !weightM || !priceM || !slugM || !nameM) continue;
    const weightKg = parseFloat(weightM[1]);
    const priceCents = parseInt(priceM[1]);
    const isLiquid = liquidM?.[1] === '1';
    const decoded = nameM[1].replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim();
    hits.push({
      productId: productIdM[1],
      slug: slugM[1],
      nom: decoded,
      weightKg,
      priceCents,
      pricePerKg: priceCents / 100 / weightKg,
      isLiquid,
      theme: themeM?.[1] || '',
      format: (subM?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim(),
    });
  }
  return hits;
}

const STOPWORDS = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'au', 'aux', 'un', 'une', 'a', 'en', 'et', 'ou', 'pour', 'avec', 'sans', 'sous', 'vide', 'sv', 'kg', 'g', 'l', 'cl', 'ml', 'pce', 'piece', 'vrac', 'france', 'ue', 'aoc', 'igp', 'bio']);

function tokens(s: string): string[] {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

const CATEGORIE_THEME: Record<string, string[]> = {
  'viande': ['meat'],
  'poisson': ['fish'],
  'légume': ['vegetable'],
  'fruit': ['fruit'],
  'laitage': ['dairy'],
  'épicerie salée': ['grocery'],
  'épicerie sucrée': ['grocery'],
  'boisson': ['drink', 'beverage'],
};

function bestMatch(query: string, hits: RungisHit[], ingUnite?: string, ingCategorie?: string): RungisHit | null {
  if (hits.length === 0) return null;
  const qt = tokens(query);
  if (qt.length === 0) return null;

  const wantsLiquid = ingUnite === 'L' || ingUnite === 'cL';
  let pool = hits.filter(h => h.isLiquid === wantsLiquid);
  if (pool.length === 0) pool = hits;

  const wantedThemes = ingCategorie ? (CATEGORIE_THEME[ingCategorie] || []) : [];
  if (wantedThemes.length > 0) {
    const themed = pool.filter(h => wantedThemes.includes(h.theme));
    if (themed.length > 0) pool = themed;
  }

  // Strict : tous les tokens query doivent apparaître dans le nom
  const strict = pool.filter(h => {
    const ct = tokens(h.nom);
    return qt.every(t => ct.includes(t));
  });
  if (strict.length === 0) return null;

  const scored = strict.map(h => {
    const ct = tokens(h.nom);
    let score = 0;
    if (ct.indexOf(qt[0]) >= 0 && ct.indexOf(qt[0]) <= 1) score += 1;
    score -= (ct.length - qt.length) * 0.2;
    return { h, score };
  });
  scored.sort((a, b) => b.score - a.score || a.h.pricePerKg - b.h.pricePerKg);
  return scored[0].h;
}

export async function POST() {
  try {
    const cookie = await loginRungis();
    if (!cookie) return NextResponse.json({ ok: false, error: 'Login Rungis échoué (creds manquantes ou invalides)' }, { status: 500 });

    const [ingSnap, pfSnap] = await Promise.all([
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'produitsFournisseurs')),
    ]);
    const ings = ingSnap.docs.map(d => ({ id: d.id, ...(d.data() as { nom: string; categorie?: string; unite?: string }) }));
    const pfs = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as { fournisseur?: string; ingredientId?: string }) }));

    let updated = 0, created = 0, noMatch = 0;
    const errors: string[] = [];

    for (const ing of ings) {
      try {
        const url = `https://rungismarket.com/app?q=${encodeURIComponent(ing.nom)}`;
        const r = await fetch(url, { headers: { 'cookie': cookie } });
        if (!r.ok) { errors.push(`${ing.nom}: HTTP ${r.status}`); continue; }
        const html = await r.text();
        const hits = parseSearchResults(html);
        const match = bestMatch(ing.nom, hits, ing.unite, ing.categorie);
        if (!match) { noMatch++; continue; }

        const isLiquid = match.isLiquid;
        const pfData = {
          fournisseur: 'Rungis',
          ingredientId: ing.id,
          ingredient: ing.nom,
          nom: match.nom,
          prix: match.priceCents / 100,
          unite: isLiquid ? 'L' : 'kg',
          quantite: match.weightKg,
          url: `https://rungismarket.com/app/product/${match.slug}`,
          format: match.format,
          theme: match.theme,
          proposition: true,
          updatedAt: new Date().toISOString(),
        };

        const existing = pfs.find(p => p.fournisseur === 'Rungis' && p.ingredientId === ing.id);
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

    return NextResponse.json({ ok: true, total: ings.length, updated, created, noMatch, errors: errors.slice(0, 10) });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
