import { NextResponse } from 'next/server';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const maxDuration = 120;

const GQL = 'https://odoo.foodflow.com/graphql/vsf';
const HBASE = { 'content-type': 'application/json', origin: 'https://foodflow.com', referer: 'https://foodflow.com/' };

const LOGIN = `mutation login($email:String!,$password:String!){login(email:$email,password:$password){partner{id}}}`;
const ME = `query GetCustomer{partner{id partner{id roles{id name} activeRole{id} company{id name}}}}`;
const SEARCH = `query GetProducts($search:String){products(search:$search,currentPage:1,pageSize:10,filter:{}){products{id productId name sku slug packagings{id qty name}}}}`;
const DDATES = `query DD($offset:Int,$limit:Int){deliveryDates(offset:$offset,limit:$limit){dates{date opened slots{id minHour maxHour minMinute maxMinute}}}}`;
const UPDATE_SHIP = `mutation US($shippingMethod:Int!,$commitmentDate:DateTime!,$timeMinDelivery:Float,$timeMaxDelivery:Float){updateCartShipping(shippingMethod:$shippingMethod,commitmentDate:$commitmentDate,timeMinDelivery:$timeMinDelivery,timeMaxDelivery:$timeMaxDelivery){__typename}}`;
const ADD_ITEMS = `mutation AddMP($products:[ProductInput]!,$shouldKeepPreviousItems:Boolean){cartAddMultipleItems(products:$products,shouldKeepPreviousItems:$shouldKeepPreviousItems){__typename}}`;

interface PanierItem {
  pfId: string;
  pfNom: string;
  fournisseur: string;
  quantite: number;
}

async function gql<T = unknown>(opName: string, query: string, vars: Record<string, unknown>, cookie: string, role?: string): Promise<{ json: { data?: T; errors?: { message: string }[] }; setCookies: string[] }> {
  const headers: Record<string, string> = { ...HBASE };
  if (cookie) headers.cookie = cookie;
  if (role) headers['Active-Role'] = role;
  const res = await fetch(`${GQL}?op=${opName}`, { method: 'POST', headers, body: JSON.stringify({ query, variables: vars, operationName: opName }) });
  const setCookies = (res.headers as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  const json = await res.json();
  return { json, setCookies };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { replace?: boolean };
    const replace = body.replace === true; // par défaut on AJOUTE (shouldKeepPreviousItems: true)

    // 1. Login
    const loginRes = await gql<{ login: { partner: { id: number } } }>('login', LOGIN, { email: process.env.FOODFLOW_EMAIL, password: process.env.FOODFLOW_PASSWORD }, '');
    const cookie = loginRes.setCookies.find((c: string) => c.startsWith('session_id='))?.split(';')[0];
    if (!cookie) return NextResponse.json({ ok: false, error: 'Login Foodflow échoué' }, { status: 500 });

    // 2. Get role + company
    const meRes = await gql<{ partner: { partner: { roles: { id: number; name: string }[]; activeRole: { id: number } | null; company: { id: number; name: string } | null } } }>('GetCustomer', ME, {}, cookie);
    const me = meRes.json.data?.partner?.partner;
    if (!me?.roles || me.roles.length === 0) return NextResponse.json({ ok: false, error: 'Aucun rôle sur ce compte Foodflow' }, { status: 500 });
    const roleId = String(me.activeRole?.id || me.roles[0].id);

    // 3. Charger le panier Firestore (uniquement Foodflow)
    const panierSnap = await getDocs(collection(db, 'panier'));
    const items: PanierItem[] = panierSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string } & PanierItem)).filter(i => i.fournisseur === 'Foodflow');
    if (items.length === 0) return NextResponse.json({ ok: false, error: 'Aucun produit Foodflow dans le panier' }, { status: 400 });

    // 4. Pour chaque PF, search → match SKU → productId + packaging
    const products: { id: number; quantity: number; packaging?: number }[] = [];
    const missing: string[] = [];
    for (const item of items) {
      const pfDoc = await getDoc(doc(db, 'produitsFournisseurs', item.pfId));
      const pf = pfDoc.data() as { nom?: string; foodflowCode?: string } | undefined;
      const sku = pf?.foodflowCode;
      if (!sku) { missing.push(`${item.pfNom} (pas de SKU)`); continue; }
      const sRes = await gql<{ products: { products: { id: number; productId: number; sku: string; packagings?: { id: number; qty: number }[] }[] } }>('GetProducts', SEARCH, { search: pf?.nom || item.pfNom }, cookie, roleId);
      const match = sRes.json.data?.products?.products.find(p => p.sku === sku);
      if (!match) { missing.push(`${item.pfNom} (SKU ${sku} introuvable)`); continue; }
      products.push({
        id: match.productId,
        quantity: item.quantite || 1,
        ...(match.packagings?.[0]?.id ? { packaging: match.packagings[0].id } : {}),
      });
    }

    if (products.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucun produit matché', missing }, { status: 400 });
    }

    // 5. Set delivery date (1er créneau dispo) si pas déjà set
    const ddRes = await gql<{ deliveryDates: { dates: { date: string; opened: boolean; slots: { id: number; minHour: number; maxHour: number; minMinute: number; maxMinute: number }[] }[] } }>('DD', DDATES, { offset: 0, limit: 14 }, cookie, roleId);
    const dates = ddRes.json.data?.deliveryDates?.dates || [];
    const openedDate = dates.find(d => d.opened && d.slots?.length > 0);
    if (openedDate) {
      const slot = openedDate.slots[0];
      const tmin = slot.minHour + (slot.minMinute || 0) / 60;
      const tmax = slot.maxHour + (slot.maxMinute || 0) / 60;
      const commitDate = `${openedDate.date}T${String(slot.minHour).padStart(2,'0')}:${String(slot.minMinute||0).padStart(2,'0')}:00`;
      await gql('US', UPDATE_SHIP, { shippingMethod: slot.id, commitmentDate: commitDate, timeMinDelivery: tmin, timeMaxDelivery: tmax }, cookie, roleId);
    }

    // 6. cartAddMultipleItems
    const addRes = await gql<{ cartAddMultipleItems: { __typename: string } }>('AddMP', ADD_ITEMS, { products, shouldKeepPreviousItems: !replace }, cookie, roleId);
    if (addRes.json.errors) {
      return NextResponse.json({ ok: false, error: addRes.json.errors[0].message, missing }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      pushed: products.length,
      total: items.length,
      missing,
      company: me.company?.name || null,
      deliveryDate: openedDate?.date || null,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
