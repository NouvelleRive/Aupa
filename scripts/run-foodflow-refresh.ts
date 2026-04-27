import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const GQL_URL = 'https://odoo.foodflow.com/graphql/vsf';
const LOGIN = `mutation login($email:String!,$password:String!){login(email:$email,password:$password){partner{id}}}`;
const SEARCH = `query GetProducts($search: String) { products(search: $search, currentPage: 1, pageSize: 10, filter: {}) { products { id name price clientPrice unit weight liter slug sku } } }`;

async function login(): Promise<string | null> {
  const res = await fetch(`${GQL_URL}?op=login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://foodflow.com', referer: 'https://foodflow.com/' },
    body: JSON.stringify({ query: LOGIN, variables: { email: process.env.FOODFLOW_EMAIL, password: process.env.FOODFLOW_PASSWORD }, operationName: 'login' }),
  });
  return (res.headers.getSetCookie?.() || []).find(x => x.startsWith('session_id='))?.split(';')[0] || null;
}

async function search(cookie: string, q: string) {
  const res = await fetch(`${GQL_URL}?op=GetProducts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: 'https://foodflow.com', referer: 'https://foodflow.com/' },
    body: JSON.stringify({ query: SEARCH, variables: { search: q }, operationName: 'GetProducts' }),
  });
  const j = await res.json();
  return (j.data?.products?.products || []) as any[];
}

function recalcPrix(api: any, pf: any): number | null {
  const apiPrix = api.clientPrice && api.clientPrice > 0 ? api.clientPrice : api.price;
  if (apiPrix <= 0) return null;
  const u = pf.unite, q = pf.quantite || 1;
  if (u === 'kg') {
    if (api.unit === 'kg') return apiPrix * q;
    if (api.weight > 0) return (apiPrix / api.weight) * q;
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
  if (u === 'pièce' || u === 'lot') {
    const nom = (pf.nom || api.name || '').toLowerCase();
    const m = nom.match(/x\s*(\d+)/);
    const N = m ? parseInt(m[1]) : 1;
    if (api.unit === 'p' && N > 0) return (apiPrix / N) * q;
    return apiPrix * q;
  }
  return null;
}

async function main() {
  const cookie = await login();
  if (!cookie) { console.error('Login Foodflow failed'); process.exit(1); }

  const ingSnap = await getDocs(collection(db, 'ingredients'));
  const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));
  const pfMap = new Map(pfSnap.docs.map(d => [d.id, { id: d.id, ...(d.data() as any) }]));

  const cibles = ingSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .map(ing => ({ ing, pf: ing.fournisseurRefId ? pfMap.get(ing.fournisseurRefId) : undefined }))
    .filter(({ pf }) => pf && (pf as any).fournisseur === 'Foodflow');

  console.log(`Refresh sur ${cibles.length} PFs Foodflow de réf...\n`);
  let okCount = 0, noMatch = 0, noPrix = 0;
  const errors: string[] = [];

  for (const { ing, pf } of cibles) {
    const p = pf as any;
    try {
      const results = await search(cookie, p.nom);
      const match = results.find((r: any) => r.sku === p.foodflowCode);
      if (!match) {
        noMatch++;
        errors.push(`${ing.nom}: pas de SKU ${p.foodflowCode} (${results.length} résultats)`);
        continue;
      }
      const slug = match.slug.startsWith('/product/') ? match.slug : `/product/${match.slug}`;
      const url = `https://foodflow.com/shop${slug}`;
      const newPrix = recalcPrix(match, p);
      const update: any = { url, foodflowSlug: slug, updatedAt: new Date().toISOString() };
      if (newPrix !== null && isFinite(newPrix) && newPrix > 0) {
        update.prix = Math.round(newPrix * 100) / 100;
      } else {
        noPrix++;
        errors.push(`${ing.nom}: URL maj OK mais prix non recalculable (api=${match.unit}, pf=${p.unite})`);
      }
      await updateDoc(doc(db, 'produitsFournisseurs', p.id), update);
      okCount++;
      if (okCount % 20 === 0) console.log(`  ${okCount} traités...`);
    } catch (e: any) {
      errors.push(`${ing.nom}: ${e.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`OK         : ${okCount}/${cibles.length}`);
  console.log(`Pas matché : ${noMatch}`);
  console.log(`Sans prix  : ${noPrix}`);
  if (errors.length > 0) {
    console.log(`\nErreurs/warnings (${errors.length}) :`);
    for (const e of errors.slice(0, 30)) console.log(`  • ${e}`);
    if (errors.length > 30) console.log(`  ... et ${errors.length - 30} de plus`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
