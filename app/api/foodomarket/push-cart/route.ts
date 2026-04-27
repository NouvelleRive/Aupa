import { NextResponse } from 'next/server';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const maxDuration = 120;

const API = 'https://f8kruyzf6k.eu-west-3.awsapprunner.com';
const SHOP = 'https://shop.foodomarket.com';
const WWW = 'https://www.foodomarket.com';

interface PanierItem {
  pfId: string;
  pfNom: string;
  fournisseur: string;
  quantite: number;
}

async function login(): Promise<string | null> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SHOP },
    body: JSON.stringify({ email: process.env.FOODOMARKET_EMAIL, password: process.env.FOODOMARKET_PASSWORD }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.access_token as string;
}

async function getRestaurantId(token: string): Promise<number | null> {
  const res = await fetch(`${API}/api/customer/restaurants`, { headers: { 'X-Auth-Token': token, origin: SHOP } });
  if (!res.ok) return null;
  const arr = await res.json() as { id: number; isSelected: boolean }[];
  return (arr.find(r => r.isSelected) || arr[0])?.id ?? null;
}

// Extrait le SKU depuis la page publique www.foodomarket.com (= productVariantId)
async function getSkuFromSlug(slug: string): Promise<number | null> {
  const cleaned = slug.replace(/^https?:\/\/[^/]+\/produits\//, '').replace(/^\//, '');
  const url = `${WWW}/produits/${cleaned}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/"sku":"(\d+)"/);
  return m ? parseInt(m[1]) : null;
}

// Cherche dans le marketplace par productVariantId pour récupérer le supplierId
async function getSupplierForVariant(token: string, productVariantId: number): Promise<number | null> {
  const url = `${SHOP}/marketplace-v2/new-catalog-search-v2?q=${productVariantId}`;
  const res = await fetch(url, {
    headers: { cookie: `_token=${token}`, 'Accept': 'text/vnd.turbo-stream.html', 'user-agent': 'Mozilla/5.0' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  // Cherche la 1ère occurrence de `<productVariantId>-<supplierId>` dans les identifiers
  const re = new RegExp(`data-add-to-cart-identifier-value="${productVariantId}-(\\d+)"`);
  const m = html.match(re);
  return m ? parseInt(m[1]) : null;
}

async function addToCart(token: string, restaurantId: number, productVariantId: number, supplierId: number): Promise<{ ok: boolean; error?: string }> {
  const url = `${SHOP}/marketplace-v2/${restaurantId}/cart_items?source=catalog`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `_token=${token}`,
      origin: SHOP,
      referer: `${SHOP}/marketplace-v2/new-catalog`,
      accept: 'text/vnd.turbo-stream.html,text/html;q=0.9,*/*;q=0.5',
    },
    body: JSON.stringify({ supplierId, productVariantId }),
  });
  if (res.status >= 200 && res.status < 300) return { ok: true };
  const text = await res.text();
  let msg = text;
  try { msg = JSON.parse(text).message || msg; } catch { /* keep raw */ }
  return { ok: false, error: msg };
}

export async function POST() {
  try {
    const token = await login();
    if (!token) return NextResponse.json({ ok: false, error: 'Login Foodomarket échoué' }, { status: 500 });

    const restaurantId = await getRestaurantId(token);
    if (!restaurantId) return NextResponse.json({ ok: false, error: 'Aucun restaurant trouvé' }, { status: 500 });

    // Charger panier Firestore (Foodomarket only)
    const panierSnap = await getDocs(collection(db, 'panier'));
    const items: (PanierItem & { id: string })[] = panierSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string } & PanierItem)).filter(i => i.fournisseur === 'Foodomarket');
    if (items.length === 0) return NextResponse.json({ ok: false, error: 'Aucun produit Foodomarket dans le panier' }, { status: 400 });

    let pushed = 0;
    const missing: string[] = [];

    for (const item of items) {
      const pfDoc = await getDoc(doc(db, 'produitsFournisseurs', item.pfId));
      const pf = pfDoc.data() as { foodomarketSlug?: string; foodomarketProductVariantId?: number; foodomarketSupplierId?: number; nom?: string } | undefined;
      if (!pf) { missing.push(`${item.pfNom} (PF introuvable)`); continue; }

      let pvId = pf.foodomarketProductVariantId;
      let sId = pf.foodomarketSupplierId;

      // Lookup SKU depuis la page publique si pas en cache
      if (!pvId) {
        const slug = pf.foodomarketSlug;
        if (!slug) { missing.push(`${item.pfNom} (pas de slug)`); continue; }
        pvId = await getSkuFromSlug(slug) || undefined;
        if (!pvId) { missing.push(`${item.pfNom} (SKU introuvable sur ${slug})`); continue; }
      }

      // Lookup supplierId via search marketplace si pas en cache
      if (!sId) {
        sId = await getSupplierForVariant(token, pvId) || undefined;
        if (!sId) { missing.push(`${item.pfNom} (supplier introuvable pour SKU ${pvId})`); continue; }
      }

      // Sauvegarde sur le PF pour la prochaine fois
      if (!pf.foodomarketProductVariantId || !pf.foodomarketSupplierId) {
        await updateDoc(doc(db, 'produitsFournisseurs', item.pfId), {
          foodomarketProductVariantId: pvId,
          foodomarketSupplierId: sId,
        });
      }

      // Ajout au panier (qty=1 d'abord, le marketplace gérera la qty manuellement)
      const result = await addToCart(token, restaurantId, pvId, sId);
      if (result.ok) pushed++;
      else missing.push(`${item.pfNom}: ${result.error?.slice(0, 100)}`);
    }

    return NextResponse.json({ ok: true, pushed, total: items.length, missing });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
