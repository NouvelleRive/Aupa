// Catégorie Les Binouz pour ETE26 (13 items).

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const ITEMS: [string, number][] = [
  ['Alex demi', 3],
  ['Alex pinte', 4.50],
  ['IPA', 4.50],
  ['IPA pinte', 6.90],
  ['Triple demi', 5.50],
  ['Triple pinte', 7.90],
  ['Bière du moment demi', 5.50],
  ['Bière du moment pinte', 7.90],
  ['Cidre demi', 5.50],
  ['Cidre pinte', 7.90],
  ['Blanche', 6],
  ['Corona', 5],
  ['Bière sans alcool', 6],
];

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  const missing: string[] = [];
  for (const [nom] of ITEMS) if (!byNom.has(nom)) missing.push(nom);
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories: any[] = menu.categories || [];

  const newCat = {
    nom: 'Les Binouz',
    recettes: ITEMS.map(([nom, prix]) => ({ id: byNom.get(nom)!, prixVente: prix })),
  };

  const idx = categories.findIndex((c: any) => c.nom === 'Les Binouz');
  if (idx >= 0) categories[idx] = newCat;
  else categories.push(newCat);

  console.log(`── ETE26 / Les Binouz ──`);
  for (const [nom, prix] of ITEMS) console.log(`  ${nom} — ${prix} €`);

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Les Binouz).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
