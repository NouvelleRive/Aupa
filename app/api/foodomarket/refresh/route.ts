import { NextResponse } from 'next/server';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function fetchProduct(slug: string) {
  const url = `https://www.foodomarket.com/produits/${slug}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const html = await res.text();

  // Prix principal : pattern "price":"X.XX" ou \"price\":\"X.XX\"
  const prices = [...html.matchAll(/\\?"price\\?":\\?"([\d.]+)\\?"/g)]
    .map(m => parseFloat(m[1]))
    .filter(n => n > 0 && n < 1000); // exclure prix aberrants
  if (prices.length === 0) return null;
  const prix = Math.min(...prices);

  // Unité : "unitText" ou "unit"
  const unitText = html.match(/"unitText":"([^"]+)"/)?.[1] || html.match(/\\?"unit\\?":\\?"([^"]+?)\\?"/)?.[1] || 'kg';
  const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/) || html.match(/"name":"([^"]+)"/);

  // Normaliser l'unité
  const u = unitText.toLowerCase();
  let unite = 'kg';
  if (u.includes('kg') || u === 'kgm') unite = 'kg';
  else if (u === 'l' || u.includes('litre')) unite = 'L';
  else if (u === 'cl') unite = 'cL';
  else if (u === 'g') unite = 'g';
  else unite = 'pièce';

  return {
    nom: nameMatch?.[1]?.trim() || slug.split('/').pop()?.replace(/-/g, ' ') || '?',
    prix,
    unite,
    quantite: 1,
    url,
  };
}

export async function POST() {
  try {
    const ingSnap = await getDocs(collection(db, 'ingredients'));
    const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));

    const ingsAvecSlug = ingSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter(i => i.foodomarketSlug);

    if (ingsAvecSlug.length === 0) {
      return NextResponse.json({ ok: true, message: 'Aucun ingrédient avec foodomarketSlug', updated: 0 });
    }

    let updated = 0;
    let created = 0;
    const errors: string[] = [];

    for (const ing of ingsAvecSlug) {
      try {
        const data = await fetchProduct(ing.foodomarketSlug);
        if (!data) { errors.push(`${ing.nom}: pas de prix trouvé`); continue; }

        // PF existant Foodomarket pour cet ingrédient
        const existing = pfSnap.docs.find(d => {
          const p = d.data() as any;
          return p.fournisseur === 'Foodomarket' && p.ingredientId === ing.id;
        });

        const pfData = {
          fournisseur: 'Foodomarket',
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
      } catch (e: any) {
        errors.push(`${ing.nom}: ${e.message}`);
      }
    }

    return NextResponse.json({ ok: true, total: ingsAvecSlug.length, updated, created, errors });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
