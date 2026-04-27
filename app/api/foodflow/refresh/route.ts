import { NextResponse } from 'next/server';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const maxDuration = 300;

const GQL_URL = 'https://odoo.foodflow.com/graphql/vsf';

const LOGIN = `mutation login($email:String!,$password:String!){login(email:$email,password:$password){partner{id}}}`;
const SEARCH = `query GetProducts($search: String) { products(search: $search, currentPage: 1, pageSize: 10, filter: {}) { products { id name price clientPrice unit weight liter slug sku } } }`;

type FoodflowResult = {
  id: number;
  name: string;
  price: number;
  clientPrice: number;
  unit: string;        // 'p', 'kg', 'L'
  weight: number;      // kg
  liter: number;       // L
  slug: string;        // ex: '/product/oeuf-plein-air-moyen-x90-13165'
  sku: string;         // ex: 'FF-001094'
};

async function login(): Promise<string | null> {
  const email = process.env.FOODFLOW_EMAIL;
  const password = process.env.FOODFLOW_PASSWORD;
  if (!email || !password) return null;
  const res = await fetch(`${GQL_URL}?op=login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://foodflow.com', referer: 'https://foodflow.com/' },
    body: JSON.stringify({ query: LOGIN, variables: { email, password }, operationName: 'login' }),
  });
  const cookies = res.headers.getSetCookie?.() || [];
  const session = cookies.find(c => c.startsWith('session_id='));
  if (!session) return null;
  const json = await res.json();
  if (json.errors || !json.data?.login?.partner?.id) return null;
  return session.split(';')[0];
}

async function search(cookie: string, q: string): Promise<FoodflowResult[]> {
  const res = await fetch(`${GQL_URL}?op=GetProducts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: 'https://foodflow.com', referer: 'https://foodflow.com/' },
    body: JSON.stringify({ query: SEARCH, variables: { search: q }, operationName: 'GetProducts' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors) throw new Error(`GQL: ${JSON.stringify(j.errors).slice(0, 200)}`);
  return j.data?.products?.products || [];
}

// Recalcule le prix dans le format du PF existant pour ne pas casser unite/quantite.
// Retourne null si on ne sait pas convertir → on skippe la maj prix mais on garde la maj URL.
function recalcPrix(api: FoodflowResult, pf: { unite?: string; quantite?: number; nom?: string }): number | null {
  const apiPrix = api.clientPrice && api.clientPrice > 0 ? api.clientPrice : api.price;
  if (apiPrix <= 0) return null;
  const u = pf.unite;
  const q = pf.quantite || 1;

  // PF stocké en kg → on veut prix pour `q` kg
  if (u === 'kg') {
    if (api.unit === 'kg') return apiPrix * q;          // apiPrix est déjà €/kg
    if (api.weight > 0) return (apiPrix / api.weight) * q;  // pack → €/kg × q
    return null;
  }
  if (u === 'g') {
    if (api.unit === 'kg') return apiPrix * (q / 1000);
    if (api.weight > 0) return (apiPrix / api.weight) * (q / 1000);
    return null;
  }
  if (u === 'L') {
    if (api.unit === 'L') return apiPrix * q;
    if (api.liter > 0) return (apiPrix / api.liter) * q;
    return null;
  }
  if (u === 'cL') {
    if (api.unit === 'L') return apiPrix * (q / 100);
    if (api.liter > 0) return (apiPrix / api.liter) * (q / 100);
    return null;
  }
  // PF en pièce → si l'API renvoie un pack, on cherche le multiplicateur xN dans le nom
  // Format PF : prix par pièce × quantite (souvent 1)
  if (u === 'pièce' || u === 'lot') {
    const nom = (pf.nom || api.name || '').toLowerCase();
    const mult = nom.match(/x\s*(\d+)/);
    const N = mult ? parseInt(mult[1]) : 1;
    if (api.unit === 'p' && N > 0) return (apiPrix / N) * q;
    return apiPrix * q; // fallback : assume 1 pack = q pièces
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '0');
    const onlyName = url.searchParams.get('nom') || '';
    const dryRun = url.searchParams.get('dryRun') === '1';

    const cookie = await login();
    if (!cookie) {
      return NextResponse.json({ ok: false, error: 'Login Foodflow échoué (creds manquantes ou invalides)' }, { status: 500 });
    }

    const ingSnap = await getDocs(collection(db, 'ingredients'));
    const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));
    const pfMap = new Map(pfSnap.docs.map(d => [d.id, { id: d.id, ...(d.data() as Record<string, unknown>) }]));

    // Cibles : ingrédients dont le PF de réf est Foodflow
    let cibles = ingSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as { nom: string; fournisseurRefId?: string }) }))
      .map(ing => {
        const pf = ing.fournisseurRefId ? pfMap.get(ing.fournisseurRefId) : undefined;
        return { ing, pf };
      })
      .filter(({ pf }) => pf && (pf as { fournisseur?: string }).fournisseur === 'Foodflow');

    if (onlyName) cibles = cibles.filter(({ ing }) => ing.nom.toLowerCase() === onlyName.toLowerCase());
    if (limit > 0) cibles = cibles.slice(0, limit);

    if (cibles.length === 0) {
      return NextResponse.json({ ok: true, message: 'Aucun PF de réf Foodflow', updated: 0, created: 0 });
    }

    let updated = 0;
    const errors: string[] = [];
    const dryRunResults: Array<Record<string, unknown>> = [];

    for (const { ing, pf } of cibles) {
      const pfTyped = pf as { id: string; nom?: string; foodflowCode?: string; unite?: string; quantite?: number };
      try {
        const results = await search(cookie, pfTyped.nom || ing.nom);
        // Match strict par SKU = foodflowCode (1:1, déterministe)
        const match = results.find(r => r.sku === pfTyped.foodflowCode);
        if (!match) {
          errors.push(`${ing.nom}: pas de match SKU ${pfTyped.foodflowCode || '—'} parmi ${results.length} résultats`);
          continue;
        }

        // Le slug API contient déjà '/product/...', l'URL canonique est /shop + slug
        const slug = match.slug.startsWith('/product/') ? match.slug : `/product/${match.slug}`;
        const url = `https://foodflow.com/shop${slug}`;

        const newPrix = recalcPrix(match, pfTyped);

        // Update ULTRA-CONSERVATEUR : on ne touche que url, prix, slug, updatedAt
        const update: Record<string, unknown> = {
          url,
          foodflowSlug: slug,
          updatedAt: new Date().toISOString(),
        };
        if (newPrix !== null && isFinite(newPrix) && newPrix > 0) {
          update.prix = Math.round(newPrix * 100) / 100;
        } else {
          errors.push(`${ing.nom}: URL maj OK mais prix non recalculable (api unit=${match.unit}, pf unite=${pfTyped.unite})`);
        }

        if (dryRun) {
          dryRunResults.push({
            ing: ing.nom,
            pfId: pfTyped.id,
            apiPrix: match.clientPrice || match.price,
            apiUnit: match.unit,
            apiWeight: match.weight,
            apiLiter: match.liter,
            pfUnite: pfTyped.unite,
            pfQuantite: pfTyped.quantite,
            update,
          });
        } else {
          await updateDoc(doc(db, 'produitsFournisseurs', pfTyped.id), update);
        }
        updated++;
      } catch (e: unknown) {
        errors.push(`${ing.nom}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({ ok: true, total: cibles.length, updated, created: 0, errors, dryRun, dryRunResults });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
