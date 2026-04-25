import { NextResponse } from 'next/server';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const maxDuration = 300;

const GQL_URL = 'https://odoo.foodflow.com/graphql/vsf';

const LOGIN_MUTATION = `
  mutation login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      partner { activeRole { id } roles { id } }
    }
  }
`;

const GET_PRODUCTS_QUERY = `
  query GetProducts($filter: ProductFilterInput, $currentPage: Int, $pageSize: Int, $search: String) {
    products(filter: $filter, currentPage: $currentPage, pageSize: $pageSize, search: $search) {
      totalCount
      products {
        id name price clientPrice weight liter unit slug productId sku
        packagings { name qty }
        categories { name slug parent { name slug } }
      }
    }
  }
`;

async function login(): Promise<string | null> {
  const email = process.env.FOODFLOW_EMAIL;
  const password = process.env.FOODFLOW_PASSWORD;
  if (!email || !password) return null;
  const res = await fetch(`${GQL_URL}?op=login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': 'https://foodflow.com', 'referer': 'https://foodflow.com/' },
    body: JSON.stringify({ query: LOGIN_MUTATION, variables: { email, password }, operationName: 'login' }),
  });
  const cookies = res.headers.getSetCookie?.() || [];
  const sessionCookie = cookies.find(c => c.startsWith('session_id='));
  if (!sessionCookie) return null;
  return sessionCookie.split(';')[0];
}

type FoodflowProduct = {
  id: number;
  name: string;
  price: number;        // prix par unité (kg/L) si unit=kg/L, sinon par pièce
  clientPrice?: number; // prix appliqué au client (avec remise éventuelle)
  weight: number;       // kg
  liter: number;        // L
  unit: string;         // 'kg', 'L', 'p'
  slug: string;
  productId: number;
  sku: string;
  packagings?: Array<{ name: string; qty: number }>;
  categories?: Array<{ name: string; slug: string; parent?: { name: string; slug: string } }>;
};

async function searchProducts(cookie: string, search: string, pageSize = 20): Promise<FoodflowProduct[]> {
  const res = await fetch(`${GQL_URL}?op=GetProducts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': cookie,
      'origin': 'https://foodflow.com',
      'referer': 'https://foodflow.com/',
    },
    body: JSON.stringify({
      query: GET_PRODUCTS_QUERY,
      variables: { search, currentPage: 1, pageSize, filter: {} },
      operationName: 'GetProducts',
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data?.products?.products || [];
}

const STOPWORDS = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'au', 'aux', 'un', 'une', 'a', 'en', 'et', 'ou', 'pour', 'avec', 'sans', 'sous', 'vide', 'sv', 'kg', 'g', 'l', 'cl', 'ml', 'pce', 'piece', 'vrac', 'france', 'ue', 'aoc', 'igp', 'bio']);

function tokens(s: string): string[] {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

// Calcule le prix par kg/L d'un produit Foodflow
function pricePerUnit(p: FoodflowProduct): number {
  const price = p.clientPrice && p.clientPrice > 0 ? p.clientPrice : p.price;
  if (p.unit === 'kg' || p.unit === 'L') return price; // déjà au kg/L
  // unit = 'p' : prix à la pièce, on divise par poids/volume
  if (p.weight > 0) return price / p.weight;
  if (p.liter > 0) return price / p.liter;
  return price; // fallback
}

function bestMatch(query: string, hits: FoodflowProduct[], ingUnite?: string): FoodflowProduct | null {
  if (hits.length === 0) return null;
  const qt = tokens(query);
  if (qt.length === 0) return null;

  // 1. Filtre liquide vs solide si l'ingrédient a une unité claire
  const wantsLiquid = ingUnite === 'L' || ingUnite === 'cL';
  let pool = hits;
  if (ingUnite) {
    const filtered = hits.filter(h => {
      const isLiquid = h.unit === 'L' || (h.liter > 0 && h.weight === 0);
      return isLiquid === wantsLiquid;
    });
    if (filtered.length > 0) pool = filtered;
  }

  // 2. Strict : tous les tokens query présents dans le nom
  const strict = pool.filter(h => {
    const ct = tokens(h.name);
    return qt.every(t => ct.includes(t));
  });
  if (strict.length === 0) return null;

  const scored = strict.map(h => {
    const ct = tokens(h.name);
    let score = 0;
    if (ct.indexOf(qt[0]) >= 0 && ct.indexOf(qt[0]) <= 1) score += 1;
    score -= (ct.length - qt.length) * 0.2;
    return { h, score };
  });
  scored.sort((a, b) => b.score - a.score || pricePerUnit(a.h) - pricePerUnit(b.h));
  return scored[0].h;
}

export async function POST() {
  try {
    const cookie = await login();
    if (!cookie) return NextResponse.json({ ok: false, error: 'Login Foodflow échoué (creds manquantes ou invalides)' }, { status: 500 });

    const [ingSnap, pfSnap] = await Promise.all([
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'produitsFournisseurs')),
    ]);
    const ings = ingSnap.docs.map(d => ({ id: d.id, ...(d.data() as { nom: string; categorie?: string; unite?: string; fournisseurRefId?: string }) }));
    const pfs = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as { fournisseur?: string; ingredientId?: string; sku?: string }) }));

    let updated = 0, created = 0, noMatch = 0;
    const errors: string[] = [];

    for (const ing of ings) {
      try {
        const hits = await searchProducts(cookie, ing.nom, 20);
        const match = bestMatch(ing.nom, hits, ing.unite);
        if (!match) { noMatch++; continue; }

        const isLiquid = match.unit === 'L' || (match.liter > 0 && match.weight === 0);
        const unite = isLiquid ? 'L' : 'kg';
        const quantite = isLiquid ? (match.liter || 1) : (match.weight || 1);
        const prixUnit = pricePerUnit(match);

        // Trouve un PF existant : Foodflow + même ingredientId, OU même SKU
        const existing = pfs.find(p =>
          (p.fournisseur === 'Foodflow' && p.ingredientId === ing.id) ||
          (p.sku && p.sku === match.sku)
        );

        const pfData = {
          fournisseur: 'Foodflow',
          ingredientId: ing.id,
          ingredient: ing.nom,
          nom: match.name,
          prix: prixUnit,
          unite,
          quantite,
          sku: match.sku,
          url: `https://foodflow.com/shop/${match.slug}`,
          proposition: true,
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

    return NextResponse.json({ ok: true, total: ings.length, updated, created, noMatch, errors: errors.slice(0, 10) });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
