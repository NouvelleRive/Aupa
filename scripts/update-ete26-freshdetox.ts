// Nouvelle catégorie Fresh & Detox pour ETE26 (10 items).

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';
const CAT_NOM = 'Fresh & Detox';

const ITEMS: [string, number][] = [
  ['Smoothie', 8],
  ['Orange pressée', 6.50],
  ['Citron pressé', 5],
  ['Citronnade', 5.50],
  ['Limonade maison', 6.50],
  ['Orangina maison', 5.50],
  ['Ginger beer maison', 6.50],
  ['Shot gingembre', 2],
  ['Shot fleur d\'oranger', 3],
  ['Shot cranberry', 2],
];

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  const missing: string[] = [];
  const idByNom: Record<string, string> = {};
  for (const [nom] of ITEMS) {
    const id = byNom.get(nom);
    if (!id) missing.push(nom);
    else idByNom[nom] = id;
  }
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories: any[] = menu.categories || [];

  const newCat = {
    nom: CAT_NOM,
    recettes: ITEMS.map(([nom, prix]) => ({ id: idByNom[nom], prixVente: prix })),
  };

  const existingIdx = categories.findIndex((c: any) => c.nom === CAT_NOM);
  if (existingIdx >= 0) {
    categories[existingIdx] = newCat;
    console.log(`ℹ️  Catégorie "${CAT_NOM}" remplacée`);
  } else {
    categories.push(newCat);
    console.log(`➕ Catégorie "${CAT_NOM}" ajoutée`);
  }

  console.log(`\n── ETE26 / ${CAT_NOM} ──`);
  for (const [nom, prix] of ITEMS) {
    console.log(`  ${nom} — ${prix} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
