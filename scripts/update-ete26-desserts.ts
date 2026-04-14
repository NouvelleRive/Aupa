// Desserts ETE26 :
// - Retire Croissant choco
// - Crée Salade fruits rouges si absente
// - Ajoute Salade fruits rouges à 7,90
// - Garde les autres aux prix actuels

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const PRIX_DESSERTS: Record<string, number> = {
  'Micuit': 6.90,
  'Crumble': 5.90,
  'Crème Brulée': 4.90,
  'Croissant perdu': 8.90,
  'Café gour': 9.90,
  'Salade fruits rouges': 7.90,
};

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  // Créer Salade fruits rouges si absente
  let sfrId = byNom.get('Salade fruits rouges');
  if (!sfrId) {
    const newDoc = await db.collection('recettes').add({
      nom: 'Salade fruits rouges',
      categorie: 'Desserts',
      saisons: [],
      carte: '',
      actif: true,
      type: 'food',
      prixVente: 7.90,
      ingredients: [],
      options: [],
      coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    sfrId = newDoc.id;
    byNom.set('Salade fruits rouges', sfrId);
    console.log(`✅ Recette créée : Salade fruits rouges (${sfrId.slice(0, 8)})`);
  } else {
    console.log(`ℹ️  Salade fruits rouges existe déjà (${sfrId.slice(0, 8)})`);
  }

  const missing: string[] = [];
  const idByNom: Record<string, string> = {};
  for (const nom of Object.keys(PRIX_DESSERTS)) {
    const id = byNom.get(nom);
    if (!id) missing.push(nom);
    else idByNom[nom] = id;
  }
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories = menu.categories || [];

  const dessCat = categories.find((c: any) => c.nom && c.nom.toLowerCase().startsWith('dessert'));
  if (!dessCat) throw new Error('Desserts introuvable');

  console.log(`\n── ETE26 / ${dessCat.nom} — AVANT ──`);
  for (const r of dessCat.recettes || []) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom || '❌'} — ${r.prixVente} €`);
  }

  dessCat.recettes = Object.entries(PRIX_DESSERTS).map(([nom, prix]) => ({
    id: idByNom[nom],
    prixVente: prix,
  }));

  console.log(`\n── ETE26 / ${dessCat.nom} — APRÈS ──`);
  for (const r of dessCat.recettes) {
    const rec = r.id === sfrId ? { data: () => ({ nom: 'Salade fruits rouges' }) } : recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom} — ${r.prixVente} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Desserts uniquement).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
