import { NextResponse } from 'next/server';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { invalidateCache } from '@/lib/firestoreCache';
import { recalculerTousLesCouts } from '@/lib/recalculCouts';

export const runtime = 'nodejs';
export const maxDuration = 300;

const GQL_URL = 'https://odoo.foodflow.com/graphql/vsf';

const LOGIN = `mutation login($email:String!,$password:String!){login(email:$email,password:$password){partner{id activeRole{id}}}}`;
const SEARCH = `query GetProducts($search: String) { products(search: $search, currentPage: 1, pageSize: 10, filter: {}) { products { id name price clientPrice unit weight liter slug sku } } }`;
// Le clientPrice (prix négocié + promos du restaurant) n'est renvoyé que si la requête porte
// l'en-tête `active-role` (id du rôle actif renvoyé par login), comme le fait le site.
// Sans lui, clientPrice = prix public (ex. Cheddar 9.95 au lieu de 9.25).
const GET_BY_ID = `query GetById($id: Int!) { products(filter: { ids: [$id] }, currentPage: 1, pageSize: 1) { products { id name price clientPrice unit weight liter slug sku } } }`;

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

type Session = Record<string, string>;

async function login(): Promise<Session | null> {
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
  const role = json.data.login.partner.activeRole?.id;
  if (!role) return null;
  return { cookie: session.split(';')[0], 'active-role': String(role) };
}

async function search(session: Session, q: string): Promise<FoodflowResult[]> {
  const res = await fetch(`${GQL_URL}?op=GetProducts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...session, 'x-ff-app': 'shop', origin: 'https://foodflow.com', referer: 'https://foodflow.com/' },
    body: JSON.stringify({ query: SEARCH, variables: { search: q }, operationName: 'GetProducts' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors) throw new Error(`GQL: ${JSON.stringify(j.errors).slice(0, 200)}`);
  return j.data?.products?.products || [];
}

async function getById(session: Session, id: number): Promise<FoodflowResult | null> {
  const res = await fetch(`${GQL_URL}?op=GetById`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...session, 'x-ff-app': 'shop', origin: 'https://foodflow.com', referer: 'https://foodflow.com/' },
    body: JSON.stringify({ query: GET_BY_ID, variables: { id }, operationName: 'GetById' }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (j.errors) return null;
  return j.data?.products?.products?.[0] || null;
}

// Prix depuis le site, normalisé comme le site l'affiche : €/L pour les liquides, €/kg
// pour le reste (unite 'L' ou 'kg', quantite 1). Seule exception : les lots de pièces
// ("x90" œufs, "x50" gobelets, "x15" sachets) d'un ingrédient compté à la pièce dans
// les recettes → € par pièce. Le format du PF est réécrit à chaque passage.
function prixDepuisSite(api: FoodflowResult, nom: string, aLaPiece: boolean): { prix: number; unite: string; quantite: number } | null {
  const apiPrix = api.clientPrice && api.clientPrice > 0 ? api.clientPrice : api.price;
  if (apiPrix <= 0) return null;
  const lot = nom.toLowerCase().match(/x\s*(\d+)/);
  if (aLaPiece && api.unit === 'p' && lot) return { prix: apiPrix / parseInt(lot[1]), unite: 'pièce', quantite: 1 };
  if (api.unit === 'L') return { prix: apiPrix, unite: 'L', quantite: 1 };
  if (api.unit === 'kg') return { prix: apiPrix, unite: 'kg', quantite: 1 };
  if (api.liter > 0) return { prix: apiPrix / api.liter, unite: 'L', quantite: 1 };
  // Volume absent côté site mais présent dans le nom ("Vinaigre Framboise 50CL")
  const vol = nom.match(/(\d+(?:[.,]\d+)?)\s*(cl|l)\b/i);
  if (vol) { const l = parseFloat(vol[1].replace(',', '.')) / (vol[2].toLowerCase() === 'cl' ? 100 : 1); if (l > 0) return { prix: apiPrix / l, unite: 'L', quantite: 1 }; }
  if (api.weight > 0) return { prix: apiPrix / api.weight, unite: 'kg', quantite: 1 };
  return { prix: apiPrix, unite: 'pièce', quantite: 1 }; // ni poids ni volume sur le site
}

// Cron Vercel (GET, autorisé par CRON_SECRET dans proxy.ts) : relit chaque matin
// le prix site des PF de réf Foodflow, après la sync des factures.
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '0');
    const onlyName = url.searchParams.get('nom') || '';
    const dryRun = url.searchParams.get('dryRun') === '1';
    // ?all=1 : tous les PF Foodflow avec un code (pas seulement les PF de réf)
    const all = url.searchParams.get('all') === '1';

    const session = await login();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Login Foodflow échoué (creds manquantes ou invalides)' }, { status: 500 });
    }

    const [ingSnap, pfSnap, recSnap] = await Promise.all([
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'produitsFournisseurs')),
      getDocs(collection(db, 'recettes')),
    ]);
    // Ingrédient compté à la pièce = unité "pièce" ET jamais utilisé en fraction (< 1) dans une recette
    const ingUnite = new Map(ingSnap.docs.map(d => [d.id, (d.data() as { unite?: string }).unite || '']));
    const ingNomVersId = new Map(ingSnap.docs.map(d => [(d.data() as { nom: string }).nom, d.id]));
    const utiliseEnFraction = new Set<string>();
    for (const r of recSnap.docs) {
      for (const l of ((r.data() as { ingredients?: { ingredientId?: string; nomIngredient?: string; grammage?: number }[] }).ingredients || [])) {
        const id = l.ingredientId || (l.nomIngredient ? ingNomVersId.get(l.nomIngredient) : undefined);
        if (id && (l.grammage || 0) > 0 && (l.grammage || 0) < 1) utiliseEnFraction.add(id);
      }
    }
    const estALaPiece = (ingId?: string) => !!ingId && /^pi[eè]ce$/i.test(ingUnite.get(ingId) || '') && !utiliseEnFraction.has(ingId);
    const pfMap = new Map(pfSnap.docs.map(d => [d.id, { id: d.id, ...(d.data() as Record<string, unknown>) }]));

    // Cibles : ingrédients dont le PF de réf est Foodflow
    let cibles = ingSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as { nom: string; fournisseurRefId?: string }) }))
      .map(ing => {
        const pf = ing.fournisseurRefId ? pfMap.get(ing.fournisseurRefId) : undefined;
        return { ing, pf };
      })
      .filter(({ pf }) => pf && (pf as { fournisseur?: string }).fournisseur === 'Foodflow');
    if (all) {
      const dejaCibles = new Set(cibles.map(({ pf }) => (pf as { id: string }).id));
      for (const pf of pfMap.values()) {
        const p = pf as { id: string; fournisseur?: string; foodflowCode?: string; nom?: string };
        if (p.fournisseur === 'Foodflow' && p.foodflowCode && !dejaCibles.has(p.id)) {
          cibles.push({ ing: { id: '', nom: p.nom || p.id }, pf });
        }
      }
    }

    if (onlyName) cibles = cibles.filter(({ ing }) => ing.nom.toLowerCase() === onlyName.toLowerCase());
    if (limit > 0) cibles = cibles.slice(0, limit);

    if (cibles.length === 0) {
      return NextResponse.json({ ok: true, message: 'Aucun PF de réf Foodflow', updated: 0, created: 0 });
    }

    let updated = 0;
    const errors: string[] = [];
    const dryRunResults: Array<Record<string, unknown>> = [];

    // 6 produits en parallèle : ~90 PF × 2 appels doivent tenir dans la durée max Vercel
    const traiter = async ({ ing, pf }: (typeof cibles)[number]) => {
      const pfTyped = pf as { id: string; nom?: string; foodflowCode?: string; unite?: string; quantite?: number; ingredientId?: string };
      try {
        const results = await search(session, pfTyped.nom || ing.nom);
        // Match strict par SKU = foodflowCode (1:1, déterministe)
        const matchSearch = results.find(r => r.sku === pfTyped.foodflowCode);
        if (!matchSearch) {
          // Produit introuvable sur le site : on garde l'ancien prix
          errors.push(`${ing.nom}: pas de match SKU ${pfTyped.foodflowCode || '—'} parmi ${results.length} résultats`);
          return;
        }

        // Re-query par id pour récupérer le prix négocié (clientPrice n'est correct qu'avec filter.ids)
        const match = (await getById(session, matchSearch.id)) || matchSearch;

        // Le slug API contient déjà '/product/...', l'URL canonique est /shop + slug
        const slug = match.slug.startsWith('/product/') ? match.slug : `/product/${match.slug}`;
        const url = `https://foodflow.com/shop${slug}`;

        const site = prixDepuisSite(match, pfTyped.nom || match.name, estALaPiece(ing.id || pfTyped.ingredientId));

        // On ne touche jamais nom / ingredientId : seulement url, slug, prix et son format
        const update: Record<string, unknown> = {
          url,
          foodflowSlug: slug,
          updatedAt: new Date().toISOString(),
        };
        if (site && isFinite(site.prix) && site.prix > 0) {
          update.prix = Math.round(site.prix * 10000) / 10000; // 4 décimales : prix unitaires < 1 cts
          update.unite = site.unite;
          update.quantite = site.quantite;
        } else {
          errors.push(`${ing.nom}: URL maj OK mais pas de prix sur le site`);
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
    };
    const file = [...cibles];
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let c = file.shift(); c; c = file.shift()) await traiter(c);
    }));

    // Les food costs suivent les nouveaux prix sans attendre un clic sur "Mettre à jour"
    let recalcul = false;
    if (!dryRun && updated > 0) {
      invalidateCache('produitsFournisseurs', 'recettes', 'ingredients');
      await recalculerTousLesCouts();
      recalcul = true;
    }

    return NextResponse.json({ ok: true, total: cibles.length, updated, created: 0, recalcul, errors, dryRun, dryRunResults });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
